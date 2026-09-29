/** Node stand-in for expo-sqlite's sync API, backed by better-sqlite3. One DB per simulated phone. */
import Database from "better-sqlite3";

// State lives on globalThis: tsx may load this file both as ESM (from the test)
// and as CJS (from the app code), and both copies must see the same phones.
const g = globalThis as unknown as { __phones?: { dbs: Map<string, Database.Database>; current: string } };
const S = (g.__phones ??= { dbs: new Map(), current: "A" });

export function useDevice(name: string) {
  S.current = name;
  if (!S.dbs.has(name)) S.dbs.set(name, new Database(":memory:"));
}

const conn = () => {
  if (!S.dbs.has(S.current)) S.dbs.set(S.current, new Database(":memory:"));
  return S.dbs.get(S.current)!;
};

function params(args: unknown[]): unknown[] {
  const p = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  return p.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
}

export function openDatabaseSync() {
  return {
    execSync: (sql: string) => conn().exec(sql),
    runSync: (sql: string, ...args: unknown[]) => {
      const r = conn().prepare(sql).run(...params(args));
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstSync: (sql: string, ...args: unknown[]) => {
      const st = conn().prepare(sql);
      return st.reader ? (st.get(...params(args)) ?? null) : (st.run(...params(args)), null);
    },
    getAllSync: (sql: string, ...args: unknown[]) => conn().prepare(sql).all(...params(args)),
    withTransactionSync: (fn: () => void) => conn().transaction(fn)(),
  };
}
