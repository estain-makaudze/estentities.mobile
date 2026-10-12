/** Pure-logic tests for the app's balance ledger (utils/balance.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLedger, computeNetBalances } from "../../utils/balance";

const A = "a", B = "b", C = "c";
const exp = (id: string, date: string, amount: number, paidBy: string, splits: any) =>
  ({ id, householdId: "h", description: id, amount, date, paidBy, categoryId: null, splits });
const pay = (id: string, date: string, amount: number, from: string, to: string) =>
  ({ id, householdId: "h", fromUserId: from, toUserId: to, amount, date, note: null });

const half = [{ userId: A, percentage: 50 }, { userId: B, percentage: 50 }];
const expenses = [
  exp("groceries", "2026-10-01", 100, B, half),       // A owes 50
  exp("fuel", "2026-10-02", 40, A, half),             // B owes A 20 → A owes 30
  exp("own lunch", "2026-10-02", 12, A, null),        // not shared
  exp("rent", "2026-10-03", 300, B, [{ userId: A, percentage: 70 }, { userId: B, percentage: 30 }]), // A owes 210 more → 240
  exp("c only", "2026-10-03", 90, C, [{ userId: C, percentage: 100 }]), // doesn't involve A
];
const payments = [pay("p1", "2026-10-03", 200, A, B), pay("p2", "2026-10-04", 40, A, B)];

test("ledger running balance ends at the net balance for every member", () => {
  const net = computeNetBalances(expenses as any, payments as any, [A, B, C]);
  for (const u of [A, B, C]) {
    const rows = computeLedger(expenses as any, payments as any, u);
    const end = rows.length ? rows[rows.length - 1].running : 0;
    assert.equal(end, Math.round(net[u] * 100) / 100, `member ${u}`);
  }
});

test("payments cancel out expense debt, in date order", () => {
  const rows = computeLedger(expenses as any, payments as any, A);
  assert.deepEqual(rows.map((r) => [r.description, r.effect, r.running]), [
    ["groceries", -50, -50],
    ["fuel", 20, -30],
    ["rent", -210, -240],
    ["Payment", 200, -40],
    ["Payment", 40, 0],
  ]);
});

test("unshared expenses are optional and never move the balance", () => {
  const rows = computeLedger(expenses as any, payments as any, A, { includeUnshared: true });
  const lunch = rows.find((r) => r.description === "own lunch")!;
  assert.equal(lunch.effect, 0);
  assert.equal(lunch.shared, false);
  assert.equal(rows[rows.length - 1].running, 0);
});
