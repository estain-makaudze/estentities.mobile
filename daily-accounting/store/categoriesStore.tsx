import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const CATEGORIES_KEY = "da_local_categories";

export interface LocalCategory {
  id: string;
  name: string;
  entry_type: "expense" | "income";
  color: string;
}

interface CategoriesContextValue {
  categories: LocalCategory[];
  isLoaded: boolean;
  addCategory: (cat: Omit<LocalCategory, "id">) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Omit<LocalCategory, "id">>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: [],
  isLoaded: false,
  addCategory: async () => {},
  updateCategory: async () => {},
  deleteCategory: async () => {},
});

function makeId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CATEGORIES_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setCategories(parsed);
          } catch (e) { console.error("Failed to parse categories", e); }
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

  return (
    <CategoriesContext.Provider value={{ categories, isLoaded, addCategory, updateCategory, deleteCategory }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
