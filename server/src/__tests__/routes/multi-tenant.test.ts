import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { createUser, createSession } from '../../services/auth.js';

async function call(app: Express, method: string, path: string, body?: any, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: data };
}

// Multi-tenancy isolation (BYOK self-hosted): a user's API keys must not be
// visible to or usable by another user.
describe('Multi-tenant key isolation (#multi-tenant)', () => {
  let app: Express;
  let tokenA: string;
  let tokenB: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    // Two distinct dashboard users.
    const userA = createUser('alice@example.com', 'password123');
    const userB = createUser('bob@example.com', 'password123');
    tokenA = createSession(userA.userId);
    tokenB = createSession(userB.userId);
  });

  it('user A can add a key scoped to themselves', async () => {
    const r = await call(app, 'POST', '/api/keys', { platform: 'openrouter', key: 'sk-A-secret' }, tokenA);
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
  });

  it('user B cannot see user A key in the list', async () => {
    const r = await call(app, 'GET', '/api/keys', undefined, tokenB);
    expect(r.status).toBe(200);
    const aliceKey = (r.body as any[]).find((k: any) => k.label === 'sk-A-secret' || k.maskedKey?.includes('sk-A'));
    // No key owned by A should appear for B (A's key carries A's user_id).
    expect((r.body as any[]).some((k: any) => k.platform === 'openrouter')).toBe(false);
  });

  it('user B cannot reveal or delete user A key', async () => {
    // Find A's key id by listing as A.
    const listA = await call(app, 'GET', '/api/keys', undefined, tokenA);
    const keyId = (listA.body as any[])[0].id;

    // B's reveal must be blocked. The reveal endpoint requires the OWNER's
    // reauth password before it touches the key; B doesn't have it, so it is
    // refused (403) — B never reaches A's row.
    const reveal = await call(app, 'POST', `/api/keys/${keyId}/reveal`, {}, tokenB);
    expect(reveal.status).toBe(403);

    // B's delete must 404: the key is scoped by user_id, so A's row is simply
    // not visible to B (no leak that it exists).
    const del = await call(app, 'DELETE', `/api/keys/${keyId}`, undefined, tokenB);
    expect(del.status).toBe(404);
  });

  it('user A still owns and can list their own key', async () => {
    const r = await call(app, 'GET', '/api/keys', undefined, tokenA);
    expect(r.status).toBe(200);
    expect((r.body as any[]).some((k: any) => k.platform === 'openrouter')).toBe(true);
  });

  it('signup creates a new user and returns a session token', async () => {
    const r = await call(app, 'POST', '/api/auth/signup', { email: 'carol@example.com', password: 'password123' });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeDefined();
    expect(r.body.email).toBe('carol@example.com');
  });
});

// Regression: DISABLE_AUTH demo with NO users in the DB (first-run setup is
// skipped) must still allow adding keys. requireAuth must resolve userId=NULL
// (not a fabricated 1) so the api_keys.user_id FK is not violated. This is the
// exact "Internal server error" the live Render backend hit on key add.
describe('DISABLE_AUTH key add with empty users table (#multi-tenant)', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    process.env.DISABLE_AUTH = 'true';
    initDb(':memory:');
    app = createApp();
    // NOTE: no createUser() call — users table is empty, as on a fresh
    // DISABLE_AUTH deploy where setup never ran.
  });

  it('adds a key without 500 when no users exist', async () => {
    const r = await call(app, 'POST', '/api/keys', { platform: 'nvidia', key: 'nvapi-abc' }, 'x');
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
  });

  it('adds a key for a second provider too', async () => {
    const r = await call(app, 'POST', '/api/keys', { platform: 'openrouter', key: 'sk-or-abc' }, 'x');
    expect(r.status).toBe(201);
  });

  it('lists the added keys (scoped to NULL user_id, visible to the operator)', async () => {
    const r = await call(app, 'GET', '/api/keys', undefined, 'x');
    expect(r.status).toBe(200);
    expect((r.body as any[]).length).toBe(2);
  });
});
