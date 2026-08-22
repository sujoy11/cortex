// Migration: ensure the `requests` table has the columns the proxy/analytics
// queries reference, regardless of how far the legacy baseline got on a given
// database.
//
// Created: 2026-08-22 (follow-up to the multi-tenant + drop_user_fk fixes).
//
// Symptom on a live DISABLE_AUTH deploy: the Playground proxy returned
// "no such column: request_type" / SqliteError 500. The column is added by the
// legacy baseline's migrateEmbeddingsV1 step, but on databases where that step
// did not complete the `requests` table was created without `request_type`
// (and possibly without `user_id` from the later multi-tenant migration).
//
// This migration idempotently adds both columns if missing so the proxy works
// on any partially-migrated DB. Safe to run repeatedly.

import type { Db } from '../types.js';

export function up(db: Db): void {
  const cols = db.prepare('PRAGMA table_info(requests)').all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);

  if (!has('request_type')) {
    db.prepare(
      "ALTER TABLE requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'chat'",
    ).run();
  }

  if (!has('user_id')) {
    db.prepare('ALTER TABLE requests ADD COLUMN user_id INTEGER').run();
    db.exec('CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id)');
  }
}

export function down(db: Db): void {
  // Reverse up(): drop only the column this migration is responsible for.
  // `user_id` is owned by the multi-tenant migration, so leave it to that
  // migration's own down(). SQLite 3.35+ supports DROP COLUMN.
  const cols = db.prepare('PRAGMA table_info(requests)').all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);

  if (has('request_type')) {
    db.prepare('ALTER TABLE requests DROP COLUMN request_type').run();
  }
}
