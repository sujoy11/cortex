// Migration: multi-tenant user scoping (BYOK self-hosted)
// Created: 2026-08-22
//
// DOWN: reversible (drops the added columns/indexes).
//
// Cortex is deployed as a self-hosted, multi-user product: several dashboard
// accounts sign up and each brings their OWN provider API keys (BYOK). A user's
// keys must never be visible to or usable by another user. The `users` and
// `sessions` tables already existed (single-operator auth), but `api_keys` and
// `requests` had no `user_id` — so every key was global and every request was
// attributed to nobody.
//
// This migration adds a nullable `user_id` to the two tables that carry
// user-owned secrets / user-owned data:
//   - api_keys: the user's provider credentials (security-critical)
//   - requests: per-user analytics + cost attribution
//
// `user_id` is NULLable (not NOT NULL) so the existing single-operator install
// keeps working: legacy rows without a user are owned by the operator and
// scoped to that operator's session (see requireAuth's DISABLE_AUTH fallback).
// New rows always carry the caller's userId.
//
// profiles / client_profiles / playground_conversations are intentionally NOT
// scoped here — they are dashboard-preference data, not user-owned secrets,
// and scoping them is a follow-up.

import type { Db } from '../types.js';

export function up(db: Db): void {
  // ALTER TABLE ADD COLUMN is not natively idempotent in SQLite, and the
  // migration runner can re-apply a migration when the source-drift guard
  // deletes its recorded row and re-runs the pending set. Guard each ALTER so
  // a second application is a no-op instead of "duplicate column name".
  const hasColumn = (table: string, column: string): boolean => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some(c => c.name === column);
  };

  if (!hasColumn('api_keys', 'user_id')) {
    db.exec(`ALTER TABLE api_keys ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);

  if (!hasColumn('requests', 'user_id')) {
    db.exec(`ALTER TABLE requests ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id)`);
}

export function down(db: Db): void {
  // SQLite can't DROP a column before 3.35 without table rebuild; the project
  // pins better-sqlite3 (SQLite >= 3.35), so DROP COLUMN is safe.
  db.exec(`
    DROP INDEX IF EXISTS idx_api_keys_user;
    ALTER TABLE api_keys DROP COLUMN user_id;

    DROP INDEX IF EXISTS idx_requests_user;
    ALTER TABLE requests DROP COLUMN user_id;
  `);
}
