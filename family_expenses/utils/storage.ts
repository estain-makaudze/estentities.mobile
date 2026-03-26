import AsyncStorage from "@react-native-async-storage/async-storage";
import { User, Expense, Settlement, CategoryConfig } from "../types";

const KEYS = {
  users: "@family_expenses:users",
  expenses: "@family_expenses:expenses",
  settlements: "@family_expenses:settlements",
  categoryConfigs: "@family_expenses:categoryConfigs",
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
