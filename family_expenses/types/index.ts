export interface User {
  id: string;
  name: string;
  color: string;
}

export interface SplitEntry {
  userId: string;
  percentage: number; // 0–100; all entries must sum to 100
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO date string
  paidBy: string; // userId
  category: string;
  /** null = payer owns 100% (no split). Otherwise every listed userId gets their percentage share. */
  splits: SplitEntry[] | null;
  note?: string;
}

export interface Settlement {
  id: string;
  /** User who is making the payment */
  fromUserId: string;
  /** User who is receiving the payment */
  toUserId: string;
  amount: number;
  date: string;
  note?: string;
}

/** Simplified: fromUserId owes toUserId `amount` */
export interface DebtSummary {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
