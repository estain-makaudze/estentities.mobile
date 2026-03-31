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

/** Configuration for default split per category */
export interface CategoryConfig {
  category: string;
  /** null = no default split (payer owns 100%). Otherwise default percentage per user. */
  defaultSplits: SplitEntry[] | null;
}

/** A user-configurable expense category */
export interface CustomCategory {
  id: string;
  name: string;
  emoji: string;
}

// ---------------------------------------------------------------------------
// Supabase-backed types
// ---------------------------------------------------------------------------

/** Public profile stored in the `profiles` table. */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  color: string;
}

/** A household that users share. */
export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

/** Join table row linking a user to a household. */
export interface HouseholdMember {
  household_id: string;
  user_id: string;
  joined_at: string;
}
