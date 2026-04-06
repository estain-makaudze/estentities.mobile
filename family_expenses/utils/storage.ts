import AsyncStorage from "@react-native-async-storage/async-storage";
import { CategoryConfig, CustomCategory, Expense, Household, Settlement, User } from "../types";

const KEYS = {
  categoryConfigs: "@family_expenses:categoryConfigs",
  customCategories: "@family_expenses:customCategories",
  householdCache: "@family_expenses:household_cache",
  expensesCache: "@family_expenses:expenses_cache",
} as const;

export async function loadCategoryConfigs(): Promise<CategoryConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.categoryConfigs);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCategoryConfigs(configs: CategoryConfig[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.categoryConfigs, JSON.stringify(configs));
}

export async function loadCustomCategories(): Promise<CustomCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.customCategories);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCustomCategories(cats: CustomCategory[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.customCategories, JSON.stringify(cats));
}

// ---------------------------------------------------------------------------
// Household cache (keyed by userId – so each user's last-known household is saved)
// ---------------------------------------------------------------------------

export async function loadHouseholdCache(
  userId: string
): Promise<{ household: Household; members: User[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${KEYS.householdCache}:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveHouseholdCache(
  userId: string,
  data: { household: Household; members: User[] }
): Promise<void> {
  await AsyncStorage.setItem(`${KEYS.householdCache}:${userId}`, JSON.stringify(data));
}

export async function clearHouseholdCache(userId: string): Promise<void> {
  await AsyncStorage.removeItem(`${KEYS.householdCache}:${userId}`);
}

// ---------------------------------------------------------------------------
// Expenses / Settlements cache (keyed by householdId)
// ---------------------------------------------------------------------------

export async function loadExpensesCache(
  householdId: string
): Promise<{ expenses: Expense[]; settlements: Settlement[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${KEYS.expensesCache}:${householdId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveExpensesCache(
  householdId: string,
  data: { expenses: Expense[]; settlements: Settlement[] }
): Promise<void> {
  await AsyncStorage.setItem(`${KEYS.expensesCache}:${householdId}`, JSON.stringify(data));
}

