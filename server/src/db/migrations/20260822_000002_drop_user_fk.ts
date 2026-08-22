// Migration: drop the user_id foreign-key constraint from api_keys/requests.
// Created: 2026-08-22 (follow-up to 20260822_000001).
//
// The original multi-tenant migration added `user_id INTEGER REFERENCES
// users(id) ON DELETE CASCADE`. Under self-hosted DISABLE_AUTH deploys the
// first-run setup is skipped, so the `users` table can be empty while keys are
// still added — a non-null user_id with no matching row then violates the FK
// and 500s every key write. The app already scopes by user_id in code; DB-level
// FK enforcement buys little here and breaks the no-login demo. Drop it.
//
// SQLite cannot ALTER a column to remove a FK, so rebuild both tables copying
// all rows (the column and its values are preserved).

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    -- api_keys
    CREATE TABLE api_keys_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked_at TEXT,
      base_url TEXT,
      proxy_encrypted TEXT,
      proxy_iv TEXT,
      proxy_auth_tag TEXT,
      model_scope_json TEXT,
      user_id INTEGER,
      last_health_error TEXT
    );
    INSERT INTO api_keys_new
      (id, platform, label, encrypted_key, iv, auth_tag, status, enabled, created_at,
       last_checked_at, base_url, proxy_encrypted, proxy_iv, proxy_auth_tag,
       model_scope_json, user_id, last_health_error)
    SELECT
      id, platform, label, encrypted_key, iv, auth_tag, status, enabled, created_at,
      last_checked_at, base_url, proxy_encrypted, proxy_iv, proxy_auth_tag,
      model_scope_json, user_id, last_health_error
    FROM api_keys;
    DROP TABLE api_keys;
    ALTER TABLE api_keys_new RENAME TO api_keys;
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

    -- requests
    CREATE TABLE requests_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      model_id TEXT NOT NULL,
      key_id INTEGER,
      status TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ttfb_ms INTEGER,
      requested_model TEXT,
      served_model TEXT,
      client_ip TEXT,
      client_user_agent TEXT,
      client_agent TEXT,
      user_id INTEGER
    );
    INSERT INTO requests_new
      (id, platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms,
       error, created_at, ttfb_ms, requested_model, served_model, client_ip,
       client_user_agent, client_agent, user_id)
    SELECT
      id, platform, model_id, key_id, status, input_tokens, output_tokens, latency_ms,
      error, created_at, ttfb_ms, requested_model, served_model, client_ip,
      client_user_agent, client_agent, user_id
    FROM requests;
    DROP TABLE requests;
    ALTER TABLE requests_new RENAME TO requests;
    CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);

    PRAGMA foreign_keys = ON;
  `);
}

export function down(db: Db): void {
  // Re-add the FK (tables must already exist from 20260822_000001 down first).
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE api_keys_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
      encrypted_key TEXT NOT NULL, iv TEXT NOT NULL, auth_tag TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown', enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), last_checked_at TEXT,
      base_url TEXT, proxy_encrypted TEXT, proxy_iv TEXT, proxy_auth_tag TEXT,
      model_scope_json TEXT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      last_health_error TEXT
    );
    INSERT INTO api_keys_old SELECT * FROM api_keys;
    DROP TABLE api_keys;
    ALTER TABLE api_keys_old RENAME TO api_keys;

    CREATE TABLE requests_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL, model_id TEXT NOT NULL, key_id INTEGER,
      status TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ttfb_ms INTEGER, requested_model TEXT, served_model TEXT,
      client_ip TEXT, client_user_agent TEXT, client_agent TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO requests_old SELECT * FROM requests;
    DROP TABLE requests;
    ALTER TABLE requests_old RENAME TO requests;
    PRAGMA foreign_keys = ON;
  `);
}
