import AsyncStorage from "@react-native-async-storage/async-storage";
import { CategoryConfig, CustomCategory } from "../types";

const KEYS = {
  categoryConfigs: "@family_expenses:categoryConfigs",
  customCategories: "@family_expenses:customCategories",
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
