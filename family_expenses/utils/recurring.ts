import { listAll, save } from "../db/repo";
import type { Expense, Frequency, Recurring } from "../types";
import { addPeriod, today } from "./dates";
import { stableId } from "./ids";

export function nextOccurrence(date: string, frequency: Frequency, intervalN: number): string {
  return addPeriod(date, frequency, intervalN);
}

export function frequencyLabel(r: Pick<Recurring, "frequency" | "intervalN">): string {
  const unit = { week: "week", month: "month", year: "year" }[r.frequency];
  if (r.intervalN === 1) return { week: "Weekly", month: "Monthly", year: "Yearly" }[r.frequency];
  return `Every ${r.intervalN} ${unit}s`;
}

/**
 * Create expenses for every due occurrence of active recurring templates.
 *
 * Instance ids are derived from (recurringId, dueDate), so if two phones both
 * generate the same occurrence while offline, the server merges them into one.
 */
export function generateDueRecurring(householdId: string, userId: string): number {
  const t = today();
  const due = listAll<Recurring>("recurring", householdId).filter((r) => r.active && r.nextDue <= t);
  if (due.length === 0) return 0;

  const items: Parameters<typeof save>[0] = [];
  let created = 0;
  for (const r of due) {
    let next = r.nextDue;
    for (let i = 0; i < 36 && next <= t; i++) {
      const expense: Expense = {
        id: stableId("recurring", r.id, next),
        householdId,
        description: r.description,
        amount: r.amount,
        date: next,
        paidBy: r.paidBy,
        categoryId: r.categoryId,
        splits: r.splits,
        note: r.note ?? null,
        recurringId: r.id,
        createdBy: userId,
      };
      items.push(["expenses", expense]);
      created++;
      next = nextOccurrence(next, r.frequency, r.intervalN);
    }
    items.push(["recurring", { ...r, nextDue: next }]);
  }
  save(items, "Recurring expenses");
  return created;
}
