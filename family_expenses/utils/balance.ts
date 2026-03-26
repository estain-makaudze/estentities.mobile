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
