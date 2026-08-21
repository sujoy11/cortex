# Cortex — Multi-Tenant SaaS Plan (BYOK, Self-Hosted)

> Goal: turn the single-user local Cortex proxy into a **multi-user, self-hosted
> product** where each user signs up, brings their own provider API keys (BYOK),
> and only sees their own keys / requests / analytics. No central billing, no
> shared key pool. One deployment serves many users on the operator's box.

## Decisions (locked)
- **Model:** BYOK — users supply their own provider keys. Zero key cost, no
  provider-ToS violation (each user is bound by their own provider account ToS).
- **Deploy:** Self-hosted — operator runs one instance; multiple users sign up.
  No Stripe, no central server. SQLite stays (per-deployment), now scoped by `user_id`.
- **DB:** Keep `better-sqlite3`. Add `user_id` scoping everywhere. No Postgres yet
  (can swap later if a single box outgrows SQLite).

## Current state (verified)
- `users` + `sessions` tables exist; auth is email+password, scrypt, session token.
- `api_keys` table has **NO** `user_id` → global key vault today.
- `requests` table has **NO** `user_id` → global request log today.
- `profiles`, `client_profiles`, `playground_conversations` also un-scoped.
- Router + analytics read global tables → must thread `req.userId`.

## Phase 1 — Multi-tenancy foundation
1. **Migration:** add `user_id INTEGER` (indexed) to `api_keys`, `requests`,
   `profiles`, `client_profiles`, `playground_conversations`, `rate_limit_usage`,
   `rate_limit_cooldowns`.
2. **Auth:** add `POST /api/signup` (createUser already exists); gate behind an
   instance flag `ALLOW_SIGNUP` (default on for self-host). Keep first-run setup.
3. **Middleware:** `requireAuth` already resolves session → expose `req.userId`
   to all `/api/*` and `/v1/*` routes.
4. **Isolation:** every key/request/profile query filtered by `req.userId`.
   Router picks keys `WHERE user_id = ?`. Analytics aggregated `WHERE user_id = ?`.
5. **Unified key (`cortex-xxxx`):** scope to owner; a user's `cortex-` key only
   routes that user's upstream keys. (Already per-key; just bind to user_id.)
6. **Tests:** per-user isolation test (user A cannot see user B's keys/requests).

## Phase 2 — Product hardening
- Signup email verification optional; password reset (reset-code.ts exists).
- Per-user rate limiting on the `/v1` proxy (avoid one user exhausting shared box).
- Admin/operator view: total users, per-user request counts (operator only).
- Docker: multi-user-ready image; document signup flow in README.

## Phase 3 — Ship
- Landing page (optional marketing site) + self-host docs.
- One-command deploy (docker-compose up) → open port → users sign up → BYOK.

## Risks
- SQLite write concurrency with many users → add WAL mode + busy_timeout.
- A malicious user could point the proxy at arbitrary upstreams (BYOK means they
  use their own keys, so blast radius is their own accounts — acceptable).
- No quota/billing → operator should cap concurrent users or add fair-use limits.
