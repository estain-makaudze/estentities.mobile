import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Expense, Settlement, CategoryConfig, CustomCategory, SplitEntry } from "../types";
import {
  loadCategoryConfigs,
  saveCategoryConfigs,
  loadCustomCategories,
  saveCustomCategories,
  loadExpensesCache,
  saveExpensesCache,
} from "../utils/storage";
import { supabase } from "../services/supabase";
import { useAuth } from "./AuthContext";
import { useHousehold } from "./HouseholdContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isNetworkError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network request failed") ||
    msg.includes("networkerror") ||
    msg.includes("fetch error")
  );
}

// ---------------------------------------------------------------------------
// Default categories (used when none are stored yet)
// ---------------------------------------------------------------------------
export const DEFAULT_CATEGORIES: CustomCategory[] = [
  { id: "groceries", name: "Groceries", emoji: "🛒" },
  { id: "utilities", name: "Utilities", emoji: "💡" },
  { id: "rent", name: "Rent", emoji: "🏠" },
  { id: "transport", name: "Transport", emoji: "🚗" },
  { id: "dining", name: "Dining", emoji: "🍽️" },
  { id: "health", name: "Health", emoji: "💊" },
  { id: "entertainment", name: "Entertainment", emoji: "🎬" },
  { id: "other", name: "Other", emoji: "📦" },
];

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AppState {
  expenses: Expense[];
  settlements: Settlement[];
  categoryConfigs: CategoryConfig[];
  customCategories: CustomCategory[];
  loaded: boolean;
}

const initialState: AppState = {
  expenses: [],
  settlements: [],
  categoryConfigs: [],
  customCategories: [],
  loaded: false,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "LOAD"; payload: { expenses: Expense[]; settlements: Settlement[]; categoryConfigs: CategoryConfig[]; customCategories: CustomCategory[] } }
  | { type: "SET_EXPENSES"; payload: Expense[] }
  | { type: "SET_SETTLEMENTS"; payload: Settlement[] }
  | { type: "ADD_EXPENSE"; payload: Expense }
  | { type: "UPDATE_EXPENSE"; payload: Expense }
  | { type: "DELETE_EXPENSE"; payload: string }
  | { type: "ADD_SETTLEMENT"; payload: Settlement }
  | { type: "DELETE_SETTLEMENT"; payload: string }
  | { type: "UPDATE_CATEGORY_CONFIG"; payload: CategoryConfig }
  | { type: "ADD_CATEGORY"; payload: CustomCategory }
  | { type: "DELETE_CATEGORY"; payload: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD":
      return { ...action.payload, loaded: true };

    case "SET_EXPENSES":
      return { ...state, expenses: action.payload };
    case "SET_SETTLEMENTS":
      return { ...state, settlements: action.payload };

    case "ADD_EXPENSE":
      return { ...state, expenses: [action.payload, ...state.expenses] };
    case "UPDATE_EXPENSE":
      return {
        ...state,
        expenses: state.expenses.map((e) =>
          e.id === action.payload.id ? action.payload : e
        ),
      };
    case "DELETE_EXPENSE":
      return {
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.payload),
      };

    case "ADD_SETTLEMENT":
      return {
        ...state,
        settlements: [action.payload, ...state.settlements],
      };
    case "DELETE_SETTLEMENT":
      return {
        ...state,
        settlements: state.settlements.filter((s) => s.id !== action.payload),
      };

    case "UPDATE_CATEGORY_CONFIG": {
      const existing = state.categoryConfigs.find(
        (c) => c.category === action.payload.category
      );
      if (existing) {
        return {
          ...state,
          categoryConfigs: state.categoryConfigs.map((c) =>
            c.category === action.payload.category ? action.payload : c
          ),
        };
      } else {
        return {
          ...state,
          categoryConfigs: [...state.categoryConfigs, action.payload],
        };
      }
    }

    case "ADD_CATEGORY":
      if (state.customCategories.find((c) => c.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        customCategories: [...state.customCategories, action.payload],
      };

    case "DELETE_CATEGORY":
      return {
        ...state,
        customCategories: state.customCategories.filter(
          (c) => c.id !== action.payload
        ),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers: map Supabase rows ↔ local Expense / Settlement
// ---------------------------------------------------------------------------

function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    description: (row.description as string) ?? "",
    amount: Number(row.amount),
    date: row.date as string,
    paidBy: row.paid_by as string,
    category: (row.category as string) ?? "Other",
    splits: (row.split_ratio as SplitEntry[] | null) ?? null,
    note: (row.note as string | undefined) ?? undefined,
  };
}

function rowToSettlement(row: Record<string, unknown>): Settlement {
  return {
    id: row.id as string,
    fromUserId: row.from_user_id as string,
    toUserId: row.to_user_id as string,
    amount: Number(row.amount),
    date: row.date as string,
    note: (row.note as string | undefined) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  addExpense: (expense: Omit<Expense, "id">) => void;
  updateExpense: (expense: Expense) => void;
  deleteExpense: (id: string) => void;
  addSettlement: (settlement: Omit<Settlement, "id">) => void;
  deleteSettlement: (id: string) => void;
  updateCategoryConfig: (config: CategoryConfig) => void;
  getCategoryConfig: (category: string) => CategoryConfig | undefined;
  addCategory: (name: string, emoji: string) => void;
  deleteCategory: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { session } = useAuth();
  const { household } = useHousehold();

  // Track whether the initial data load for the current household completed, so
  // the persist effect doesn't overwrite the cache with an empty initial state.
  const dataLoadedRef = useRef(false);

  // Load categories from local storage on mount.
  useEffect(() => {
    (async () => {
      const [categoryConfigs, customCategories] = await Promise.all([
        loadCategoryConfigs(),
        loadCustomCategories(),
      ]);
      dispatch({
        type: "LOAD",
        payload: {
          expenses: [],
          settlements: [],
          categoryConfigs,
          customCategories: customCategories.length > 0 ? customCategories : DEFAULT_CATEGORIES,
        },
      });
    })();
  }, []);

  // Persist categories whenever they change.
  useEffect(() => {
    if (!state.loaded) return;
    saveCategoryConfigs(state.categoryConfigs);
    saveCustomCategories(state.customCategories);
  }, [state.categoryConfigs, state.customCategories, state.loaded]);

  // Load expenses & settlements from Supabase whenever household changes.
  // Falls back to local cache when offline so data survives app restarts.
  useEffect(() => {
    dataLoadedRef.current = false;
    if (!household?.id) {
      dispatch({ type: "SET_EXPENSES", payload: [] });
      dispatch({ type: "SET_SETTLEMENTS", payload: [] });
      return;
    }

    (async () => {
      const [expRows, setRows] = await Promise.all([
        supabase
          .from("expenses")
          .select("*")
          .eq("household_id", household.id)
          .order("date", { ascending: false }),
        supabase
          .from("settlements")
          .select("*")
          .eq("household_id", household.id)
          .order("date", { ascending: false }),
      ]);

      // If network error on either fetch, load from local cache instead.
      if (
        (expRows.error && isNetworkError(expRows.error)) ||
        (setRows.error && isNetworkError(setRows.error))
      ) {
        const cached = await loadExpensesCache(household.id);
        if (cached) {
          dispatch({ type: "SET_EXPENSES", payload: cached.expenses });
          dispatch({ type: "SET_SETTLEMENTS", payload: cached.settlements });
        }
        dataLoadedRef.current = true;
        return;
      }

      const expenses = (expRows.data ?? []).map(rowToExpense);
      const settlements = (setRows.data ?? []).map(rowToSettlement);

      dispatch({ type: "SET_EXPENSES", payload: expenses });
      dispatch({ type: "SET_SETTLEMENTS", payload: settlements });

      // Persist successful fetch to cache for offline use.
      await saveExpensesCache(household.id, { expenses, settlements });
      dataLoadedRef.current = true;
    })();
  }, [household?.id]);

  // Supabase Realtime: subscribe to expense & settlement changes.
  useEffect(() => {
    if (!household?.id) return;

    const channel = supabase
      .channel(`app_data:${household.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `household_id=eq.${household.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("expenses")
            .select("*")
            .eq("household_id", household.id)
            .order("date", { ascending: false });
          const expenses = (data ?? []).map(rowToExpense);
          dispatch({ type: "SET_EXPENSES", payload: expenses });
          // Keep cache in sync with server data.
          const cached = await loadExpensesCache(household.id);
          await saveExpensesCache(household.id, {
            expenses,
            settlements: cached?.settlements ?? [],
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settlements",
          filter: `household_id=eq.${household.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("settlements")
            .select("*")
            .eq("household_id", household.id)
            .order("date", { ascending: false });
          const settlements = (data ?? []).map(rowToSettlement);
          dispatch({ type: "SET_SETTLEMENTS", payload: settlements });
          const cached = await loadExpensesCache(household.id);
          await saveExpensesCache(household.id, {
            expenses: cached?.expenses ?? [],
            settlements,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [household?.id]);

  // Persist expenses/settlements to cache whenever they change so optimistic
  // items (added offline) survive app restarts.
  useEffect(() => {
    if (!household?.id || !dataLoadedRef.current) return;
    saveExpensesCache(household.id, {
      expenses: state.expenses,
      settlements: state.settlements,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.expenses, state.settlements]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addExpense = useCallback(
    (expense: Omit<Expense, "id">) => {
      if (!household?.id || !session?.user.id) return;
      // Optimistic update
      const tempId = `tmp-${Date.now()}`;
      dispatch({ type: "ADD_EXPENSE", payload: { ...expense, id: tempId } });

      supabase
        .from("expenses")
        .insert({
          household_id: household.id,
          paid_by: expense.paidBy,
          amount: expense.amount,
          description: expense.description,
          date: expense.date.substring(0, 10),
          category: expense.category,
          note: expense.note ?? null,
          split_ratio: expense.splits ?? null,
        })
        .then(({ error }) => {
          if (error) {
            if (isNetworkError(error)) {
              // Keep the optimistic item in state (the persist effect will cache it)
              // and queue the write for when back online.
              queueWrite({ type: "ADD_EXPENSE", payload: expense, householdId: household.id });
            } else {
              // Real API error → roll back the optimistic item.
              dispatch({ type: "DELETE_EXPENSE", payload: tempId });
            }
          }
        });
    },
    [household?.id, session?.user.id]
  );

  const updateExpense = useCallback(
    (expense: Expense) => {
      if (!household?.id) return;
      dispatch({ type: "UPDATE_EXPENSE", payload: expense });

      supabase
        .from("expenses")
        .update({
          paid_by: expense.paidBy,
          amount: expense.amount,
          description: expense.description,
          date: expense.date.substring(0, 10),
          category: expense.category,
          note: expense.note ?? null,
          split_ratio: expense.splits ?? null,
        })
        .eq("id", expense.id)
        .then(({ error }) => {
          if (error) queueWrite({ type: "UPDATE_EXPENSE", payload: expense, householdId: household.id });
        });
    },
    [household?.id]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      if (!household?.id) return;
      dispatch({ type: "DELETE_EXPENSE", payload: id });

      supabase
        .from("expenses")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) queueWrite({ type: "DELETE_EXPENSE", payload: id, householdId: household.id });
        });
    },
    [household?.id]
  );

  const addSettlement = useCallback(
    (settlement: Omit<Settlement, "id">) => {
      if (!household?.id || !session?.user.id) return;
      const tempId = `tmp-${Date.now()}`;
      dispatch({ type: "ADD_SETTLEMENT", payload: { ...settlement, id: tempId } });

      supabase
        .from("settlements")
        .insert({
          household_id: household.id,
          from_user_id: settlement.fromUserId,
          to_user_id: settlement.toUserId,
          amount: settlement.amount,
          date: settlement.date.substring(0, 10),
          note: settlement.note ?? null,
        })
        .then(({ error }) => {
          if (error) {
            if (isNetworkError(error)) {
              queueWrite({ type: "ADD_SETTLEMENT", payload: settlement, householdId: household.id });
            } else {
              dispatch({ type: "DELETE_SETTLEMENT", payload: tempId });
            }
          }
        });
    },
    [household?.id, session?.user.id]
  );

  const deleteSettlement = useCallback(
    (id: string) => {
      if (!household?.id) return;
      dispatch({ type: "DELETE_SETTLEMENT", payload: id });

      supabase
        .from("settlements")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) queueWrite({ type: "DELETE_SETTLEMENT", payload: id, householdId: household.id });
        });
    },
    [household?.id]
  );

  const updateCategoryConfig = useCallback((config: CategoryConfig) => {
    dispatch({ type: "UPDATE_CATEGORY_CONFIG", payload: config });
  }, []);

  const getCategoryConfig = useCallback((category: string) => {
    return state.categoryConfigs.find((c) => c.category === category);
  }, [state.categoryConfigs]);

  const addCategory = useCallback((name: string, emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dispatch({ type: "ADD_CATEGORY", payload: { id, name: name.trim(), emoji } });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    dispatch({ type: "DELETE_CATEGORY", payload: id });
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        addExpense,
        updateExpense,
        deleteExpense,
        addSettlement,
        deleteSettlement,
        updateCategoryConfig,
        getCategoryConfig,
        addCategory,
        deleteCategory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Offline write queue helpers (simple AsyncStorage-based queue)
// ---------------------------------------------------------------------------
type QueuedWrite = {
  type: string;
  payload: unknown;
  householdId: string;
};

function queueWrite(item: QueuedWrite) {
  const key = "@family_expenses:write_queue";
  AsyncStorage.getItem(key).then((raw) => {
    const queue: QueuedWrite[] = raw ? JSON.parse(raw) : [];
    queue.push(item);
    AsyncStorage.setItem(key, JSON.stringify(queue));
  });
}

