import type { Expense, Settlement } from "../types";
import { db } from "./database";
import { fromRow } from "./repo";

/** Analytics queries — run in SQLite so dashboards stay fast and fully offline. */

const LIVE = "deleted_at IS NULL";

export function expensesBetween(hh: string, from: string, to: string): Expense[] {
  return db
    .getAllSync<Record<string, unknown>>(
      `SELECT * FROM expenses WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
       ORDER BY date DESC, rowid DESC`,
      hh, from, to
    )
    .map((r) => fromRow<Expense>("expenses", r));
}

export function allExpenses(hh: string): Expense[] {
  return db
    .getAllSync<Record<string, unknown>>(
      `SELECT * FROM expenses WHERE household_id = ? AND ${LIVE} ORDER BY date DESC, rowid DESC`, hh
    )
    .map((r) => fromRow<Expense>("expenses", r));
}

export function allSettlements(hh: string): Settlement[] {
  return db
    .getAllSync<Record<string, unknown>>(
      `SELECT * FROM settlements WHERE household_id = ? AND ${LIVE} ORDER BY date DESC, rowid DESC`, hh
    )
    .map((r) => fromRow<Settlement>("settlements", r));
}

export function totalBetween(hh: string, from: string, to: string): number {
  return (
    db.getFirstSync<{ t: number | null }>(
      `SELECT sum(amount) AS t FROM expenses WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?`,
      hh, from, to
    )?.t ?? 0
  );
}

export function categoryTotals(hh: string, from: string, to: string) {
  return db.getAllSync<{ categoryId: string | null; total: number; count: number }>(
    `SELECT category_id AS categoryId, sum(amount) AS total, count(*) AS count
     FROM expenses WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
     GROUP BY category_id ORDER BY total DESC`,
    hh, from, to
  );
}

/** Totals per "YYYY-MM" between two dates (inclusive). */
export function monthlyTotals(hh: string, from: string, to: string) {
  return db.getAllSync<{ month: string; total: number }>(
    `SELECT substr(date, 1, 7) AS month, sum(amount) AS total
     FROM expenses WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
     GROUP BY month ORDER BY month`,
    hh, from, to
  );
}

export function monthlyCategoryTotals(hh: string, from: string, to: string) {
  return db.getAllSync<{ month: string; categoryId: string | null; total: number }>(
    `SELECT substr(date, 1, 7) AS month, category_id AS categoryId, sum(amount) AS total
     FROM expenses WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
     GROUP BY month, category_id`,
    hh, from, to
  );
}

export function dailyTotals(hh: string, from: string, to: string) {
  return db.getAllSync<{ date: string; total: number }>(
    `SELECT date, sum(amount) AS total FROM expenses
     WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
     GROUP BY date ORDER BY date`,
    hh, from, to
  );
}

export function paidByTotals(hh: string, from: string, to: string) {
  return db.getAllSync<{ userId: string; total: number }>(
    `SELECT paid_by AS userId, sum(amount) AS total FROM expenses
     WHERE household_id = ? AND ${LIVE} AND date BETWEEN ? AND ?
     GROUP BY paid_by ORDER BY total DESC`,
    hh, from, to
  );
}

export type Activity =
  | { kind: "expense"; item: Expense }
  | { kind: "settlement"; item: Settlement };

/** Expenses + settlements merged, newest first. */
export function recentActivity(hh: string, limit: number, search = ""): Activity[] {
  const q = `%${search.trim()}%`;
  const exps = db
    .getAllSync<Record<string, unknown>>(
      `SELECT * FROM expenses WHERE household_id = ? AND ${LIVE}
         AND (? = '%%' OR description LIKE ? OR note LIKE ?)
       ORDER BY date DESC, rowid DESC LIMIT ?`,
      hh, q, q, q, limit
    )
    .map((r) => ({ kind: "expense" as const, item: fromRow<Expense>("expenses", r) }));
  const sets = search.trim()
    ? []
    : db
        .getAllSync<Record<string, unknown>>(
          `SELECT * FROM settlements WHERE household_id = ? AND ${LIVE} ORDER BY date DESC, rowid DESC LIMIT ?`,
          hh, limit
        )
        .map((r) => ({ kind: "settlement" as const, item: fromRow<Settlement>("settlements", r) }));
  return [...exps, ...sets].sort((a, b) => b.item.date.localeCompare(a.item.date)).slice(0, limit);
}

export function firstExpenseDate(hh: string): string | null {
  return (
    db.getFirstSync<{ d: string | null }>(
      `SELECT min(date) AS d FROM expenses WHERE household_id = ? AND ${LIVE}`, hh
    )?.d ?? null
  );
}
