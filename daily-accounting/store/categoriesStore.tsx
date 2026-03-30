import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const CATEGORIES_KEY = "da_local_categories";

export interface LocalCategory {
  id: string;
  name: string;
  entry_type: "expense" | "income";
  color: string;
}

export const DEFAULT_CATEGORIES: LocalCategory[] = [
  { id: "def_1", name: "Food & Dining", entry_type: "expense", color: "#EF4444" },
  { id: "def_2", name: "Transport", entry_type: "expense", color: "#F59E0B" },
  { id: "def_3", name: "Utilities", entry_type: "expense", color: "#3B82F6" },
  { id: "def_4", name: "Entertainment", entry_type: "expense", color: "#8B5CF6" },
  { id: "def_5", name: "Healthcare", entry_type: "expense", color: "#10B981" },
  { id: "def_6", name: "Shopping", entry_type: "expense", color: "#F97316" },
  { id: "def_7", name: "Salary", entry_type: "income", color: "#22C55E" },
  { id: "def_8", name: "Freelance", entry_type: "income", color: "#06B6D4" },
  { id: "def_9", name: "Other", entry_type: "expense", color: "#6B7280" },
];

interface CategoriesContextValue {
  categories: LocalCategory[];
  isLoaded: boolean;
  addCategory: (cat: Omit<LocalCategory, "id">) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Omit<LocalCategory, "id">>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: DEFAULT_CATEGORIES,
  isLoaded: false,
  addCategory: async () => {},
  updateCategory: async () => {},
  deleteCategory: async () => {},
  resetToDefaults: async () => {},
});

function makeId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<LocalCategory[]>(DEFAULT_CATEGORIES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CATEGORIES_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) setCategories(parsed);
          } catch {}
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback(async (cats: LocalCategory[]) => {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
    setCategories(cats);
  }, []);

  const addCategory = useCallback(
    async (cat: Omit<LocalCategory, "id">) => {
      await persist([...categories, { ...cat, id: makeId() }]);
    },
    [categories, persist]
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<Omit<LocalCategory, "id">>) => {
      await persist(categories.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    },
    [categories, persist]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      await persist(categories.filter((c) => c.id !== id));
    },
    [categories, persist]
  );

  const resetToDefaults = useCallback(async () => {
    await persist(DEFAULT_CATEGORIES);
  }, [persist]);

  return (
    <CategoriesContext.Provider value={{ categories, isLoaded, addCategory, updateCategory, deleteCategory, resetToDefaults }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
