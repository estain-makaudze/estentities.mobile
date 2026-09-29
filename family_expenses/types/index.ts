// ── Identity & household ────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  color: string;
  phone?: string | null;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  currency: string; // ISO 4217, one per household
  ownerId: string | null;
}

export interface HouseholdMember {
  householdId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
  leftAt: string | null;
}

// ── Synced records (client-generated UUIDs) ─────────────────────────────────

export interface SplitEntry {
  userId: string;
  percentage: number; // 0–100; all entries must sum to 100
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  emoji: string;
  color: string | null;
  /** null = no default split (payer owns 100%) */
  defaultSplits: SplitEntry[] | null;
  sortOrder: number;
}

export interface Expense {
  id: string;
  householdId: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paidBy: string; // userId
  categoryId: string | null;
  /** null = payer owns 100% (no split). Otherwise every listed userId gets their percentage share. */
  splits: SplitEntry[] | null;
  note?: string | null;
  recurringId?: string | null;
  createdBy?: string | null;
}

export interface Settlement {
  id: string;
  householdId: string;
  /** User who is making the payment */
  fromUserId: string;
  /** User who is receiving the payment */
  toUserId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string | null;
}

/** Monthly budget; categoryId null = whole household. */
export interface Budget {
  id: string;
  householdId: string;
  categoryId: string | null;
  amount: number;
}

export type Frequency = "week" | "month" | "year";

export interface Recurring {
  id: string;
  householdId: string;
  description: string;
  amount: number;
  categoryId: string | null;
  paidBy: string;
  splits: SplitEntry[] | null;
  note?: string | null;
  frequency: Frequency;
  intervalN: number;
  startDate: string; // YYYY-MM-DD
  nextDue: string; // YYYY-MM-DD
  active: boolean;
}

/** Simplified: fromUserId owes toUserId `amount` */
export interface DebtSummary {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export type EntityName = "categories" | "expenses" | "settlements" | "budgets" | "recurring";
