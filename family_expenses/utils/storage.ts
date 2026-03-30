import AsyncStorage from "@react-native-async-storage/async-storage";
import { User, Expense, Settlement, CategoryConfig, CustomCategory, AuthAccount } from "../types";

const KEYS = {
  users: "@family_expenses:users",
  expenses: "@family_expenses:expenses",
  settlements: "@family_expenses:settlements",
  categoryConfigs: "@family_expenses:categoryConfigs",
  customCategories: "@family_expenses:customCategories",
  authAccounts: "@family_expenses:auth_accounts",
  authSession: "@family_expenses:auth_session",
} as const;

export async function loadUsers(): Promise<User[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.users);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveUsers(users: User[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.users, JSON.stringify(users));
}

export async function loadExpenses(): Promise<Expense[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.expenses);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.expenses, JSON.stringify(expenses));
}

export async function loadSettlements(): Promise<Settlement[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.settlements);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSettlements(settlements: Settlement[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.settlements, JSON.stringify(settlements));
}

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

export async function loadAuthAccounts(): Promise<AuthAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.authAccounts);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAuthAccounts(accounts: AuthAccount[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.authAccounts, JSON.stringify(accounts));
}

export async function loadAuthSession(): Promise<AuthAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.authSession);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveAuthSession(account: AuthAccount | null): Promise<void> {
  if (account) {
    await AsyncStorage.setItem(KEYS.authSession, JSON.stringify(account));
  } else {
    await AsyncStorage.removeItem(KEYS.authSession);
  }
}
