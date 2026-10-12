import * as SQLite from "expo-sqlite";

/**
 * On-device database — the single source of truth for the UI.
 * Every write lands here first (plus an outbox row, in the same transaction);
 * the sync engine pushes the outbox and pulls server changes when online.
 */
export const db = SQLite.openDatabaseSync("family.db");

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, phone TEXT
);
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, invite_code TEXT NOT NULL,
  currency TEXT NOT NULL, owner_id TEXT
);
CREATE TABLE IF NOT EXISTS members (
  household_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  joined_at TEXT, left_at TEXT, PRIMARY KEY (household_id, user_id)
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, name TEXT NOT NULL,
  emoji TEXT NOT NULL, color TEXT, default_splits TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  client_updated_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, paid_by TEXT NOT NULL,
  created_by TEXT, amount REAL NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL,
  category_id TEXT, note TEXT, splits TEXT, recurring_id TEXT,
  client_updated_at TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS expenses_hh_date ON expenses (household_id, date);
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, note TEXT,
  client_updated_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, category_id TEXT,
  amount REAL NOT NULL, client_updated_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY NOT NULL, household_id TEXT NOT NULL, description TEXT NOT NULL,
  amount REAL NOT NULL, category_id TEXT, paid_by TEXT NOT NULL, splits TEXT, note TEXT,
  frequency TEXT NOT NULL, interval_n INTEGER NOT NULL DEFAULT 1, start_date TEXT NOT NULL,
  next_due TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  client_updated_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  client_updated_at TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS outbox_record ON outbox (record_id);
`;

export function initDatabase() {
  db.execSync("PRAGMA journal_mode = WAL;");
  const row = db.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
    db.withTransactionSync(() => {
      db.execSync(SCHEMA);
      db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  }
}

// Create tables on first import, before any provider reads meta during render.
initDatabase();

// ── meta key/value ──────────────────────────────────────────────────────────

export function getMeta(key: string): string | null {
  return db.getFirstSync<{ value: string | null }>("SELECT value FROM meta WHERE key = ?", key)?.value ?? null;
}

export function setMeta(key: string, value: string | null) {
  if (value === null) db.runSync("DELETE FROM meta WHERE key = ?", key);
  else db.runSync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
}

/** Wipe everything (logout) — except the server address and appearance choice. */
export function resetDatabase() {
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM meta WHERE key NOT IN ('apiUrl', 'theme')");
    for (const t of ["users", "households", "members", "categories", "expenses",
                     "settlements", "budgets", "recurring", "outbox"]) {
      db.runSync(`DELETE FROM ${t}`);
    }
  });
}
