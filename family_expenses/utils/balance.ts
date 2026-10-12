import { Expense, Settlement, DebtSummary } from "../types";

/**
 * Compute a net balance map.
 * Positive value  → user is owed that amount overall.
 * Negative value  → user owes that amount overall.
 */
export function computeNetBalances(
  expenses: Expense[],
  settlements: Settlement[],
  userIds: string[]
): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const uid of userIds) balance[uid] = 0;

  for (const expense of expenses) {
    const { amount, paidBy, splits } = expense;

    if (!splits || splits.length === 0) {
      // Payer owns 100% — no one else owes anything for this expense.
      // (Payer paid and is not splitting, so net effect is zero on balances.)
      continue;
    }

    // Credit the payer for the full amount.
    if (balance[paidBy] !== undefined) balance[paidBy] += amount;

    // Debit each participant's share.
    for (const split of splits) {
      if (balance[split.userId] !== undefined) {
        balance[split.userId] -= (amount * split.percentage) / 100;
      }
    }
  }

  // Apply settlements: fromUser pays toUser, so fromUser balance goes up
  // (less debt) and toUser balance goes down.
  for (const s of settlements) {
    if (balance[s.fromUserId] !== undefined) balance[s.fromUserId] += s.amount;
    if (balance[s.toUserId] !== undefined) balance[s.toUserId] -= s.amount;
  }

  return balance;
}

/**
 * Simplify the debt graph into a minimal set of payments.
 * Returns pairs where fromUserId owes toUserId `amount`.
 */
export function computeDebtSummary(
  balances: Record<string, number>
): DebtSummary[] {
  // Separate creditors (positive) and debtors (negative).
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, bal] of Object.entries(balances)) {
    if (bal > 0.009) creditors.push({ id, amount: bal });
    else if (bal < -0.009) debtors.push({ id, amount: -bal });
  }

  const result: DebtSummary[] = [];

  // Greedy matching to minimise transactions.
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const settled = Math.min(credit.amount, debt.amount);

    if (settled > 0.009) {
      result.push({ fromUserId: debt.id, toUserId: credit.id, amount: settled });
    }

    credit.amount -= settled;
    debt.amount -= settled;

    if (credit.amount < 0.009) ci++;
    if (debt.amount < 0.009) di++;
  }

  return result;
}

/** Total amount paid by a user across all expenses. */
export function totalPaidByUser(expenses: Expense[], userId: string): number {
  return expenses
    .filter((e) => e.paidBy === userId)
    .reduce((sum, e) => sum + e.amount, 0);
}

/** Total share owed by a user (from split expenses only). */
export function totalOwedByUser(expenses: Expense[], userId: string): number {
  let total = 0;
  for (const expense of expenses) {
    if (!expense.splits) continue;
    const split = expense.splits.find((s) => s.userId === userId);
    if (split) total += (expense.amount * split.percentage) / 100;
  }
  return total;
}

// ── Ledger: how every expense and payment moves one member's balance ─────────

export interface LedgerRow {
  id: string;
  kind: "expense" | "payment";
  date: string;
  description: string;
  /** who paid (expense) / who sent the money (payment) */
  fromUserId: string;
  /** payment receiver; null for expenses */
  toUserId: string | null;
  amount: number;
  /** this member's share of an expense (0 for payments / unshared) */
  share: number;
  /** change to the member's balance: + = others owe them more, − = they owe more */
  effect: number;
  /** member's balance after this row (ends at computeNetBalances()[userId]) */
  running: number;
  shared: boolean;
}

/**
 * Chronological ledger from one member's point of view. Expenses they paid for
 * others push their balance up; their share of others' expenses pushes it
 * down; payments they send (or receive) cancel debt out.
 */
export function computeLedger(
  expenses: Expense[],
  settlements: Settlement[],
  userId: string,
  opts: { includeUnshared?: boolean } = {}
): LedgerRow[] {
  type Item = { date: string; order: number; row: Omit<LedgerRow, "running"> };
  const items: Item[] = [];
  let order = 0;
  for (const e of expenses) {
    const shared = !!e.splits && e.splits.length > 0;
    const share = shared ? ((e.splits!.find((s) => s.userId === userId)?.percentage ?? 0) * e.amount) / 100 : 0;
    const effect = !shared ? 0 : (e.paidBy === userId ? e.amount : 0) - share;
    const involved = e.paidBy === userId || share > 0;
    if (!involved || (!shared && !opts.includeUnshared)) continue;
    items.push({
      date: e.date,
      order: order++,
      row: {
        id: e.id, kind: "expense", date: e.date, description: e.description, fromUserId: e.paidBy,
        toUserId: null, amount: e.amount, share, effect, shared,
      },
    });
  }
  for (const s of settlements) {
    if (s.fromUserId !== userId && s.toUserId !== userId) continue;
    items.push({
      date: s.date,
      order: order++,
      row: {
        id: s.id, kind: "payment", date: s.date, description: s.note || "Payment", fromUserId: s.fromUserId,
        toUserId: s.toUserId, amount: s.amount, share: 0, shared: true,
        effect: s.fromUserId === userId ? s.amount : -s.amount,
      },
    });
  }
  // Oldest first; on the same day expenses come before payments that settle them.
  items.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date)
      : a.row.kind !== b.row.kind ? (a.row.kind === "expense" ? -1 : 1)
      : a.order - b.order
  );
  let running = 0;
  return items.map(({ row }) => {
    running += row.effect;
    return { ...row, running: Math.round(running * 100) / 100 };
  });
}
