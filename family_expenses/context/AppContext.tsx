import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { User, Expense, Settlement, CategoryConfig, CustomCategory } from "../types";
import {
  loadUsers,
  saveUsers,
  loadExpenses,
  saveExpenses,
  loadSettlements,
  saveSettlements,
  loadCategoryConfigs,
  saveCategoryConfigs,
  loadCustomCategories,
  saveCustomCategories,
} from "../utils/storage";
import { USER_COLORS } from "../constants/colors";

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
  users: User[];
  expenses: Expense[];
  settlements: Settlement[];
  categoryConfigs: CategoryConfig[];
  customCategories: CustomCategory[];
  loaded: boolean;
}

const initialState: AppState = {
  users: [],
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
  | { type: "LOAD"; payload: { users: User[]; expenses: Expense[]; settlements: Settlement[]; categoryConfigs: CategoryConfig[]; customCategories: CustomCategory[] } }
  | { type: "ADD_USER"; payload: User }
  | { type: "UPDATE_USER"; payload: User }
  | { type: "DELETE_USER"; payload: string }
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

    case "ADD_USER":
      return { ...state, users: [...state.users, action.payload] };
    case "UPDATE_USER":
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.payload.id ? action.payload : u
        ),
      };
    case "DELETE_USER":
      return {
        ...state,
        users: state.users.filter((u) => u.id !== action.payload),
      };

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

    case "UPDATE_CATEGORY_CONFIG":
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
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  addUser: (user: Omit<User, "id">) => void;
  updateUser: (user: User) => void;
  deleteUser: (id: string) => void;
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


function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load persisted data on mount.
  useEffect(() => {
    (async () => {
      const [users, expenses, settlements, categoryConfigs, customCategories] = await Promise.all([
        loadUsers(),
        loadExpenses(),
        loadSettlements(),
        loadCategoryConfigs(),
        loadCustomCategories(),
      ]);
      dispatch({
        type: "LOAD",
        payload: {
          users,
          expenses,
          settlements,
          categoryConfigs,
          customCategories: customCategories.length > 0 ? customCategories : DEFAULT_CATEGORIES,
        },
      });
    })();
  }, []);

  // Persist whenever state changes (after initial load).
  useEffect(() => {
    if (!state.loaded) return;
    saveUsers(state.users);
    saveExpenses(state.expenses);
    saveSettlements(state.settlements);
    saveCategoryConfigs(state.categoryConfigs);
    saveCustomCategories(state.customCategories);
  }, [state.users, state.expenses, state.settlements, state.categoryConfigs, state.customCategories, state.loaded]);

  const addUser = useCallback((user: Omit<User, "id">) => {
    const nextColor =
      USER_COLORS[state.users.length % USER_COLORS.length];
    dispatch({
      type: "ADD_USER",
      payload: { ...user, id: uuid(), color: user.color || nextColor },
    });
  }, [state.users.length]);

  const updateUser = useCallback((user: User) => {
    dispatch({ type: "UPDATE_USER", payload: user });
  }, []);

  const deleteUser = useCallback((id: string) => {
    dispatch({ type: "DELETE_USER", payload: id });
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, "id">) => {
    dispatch({ type: "ADD_EXPENSE", payload: { ...expense, id: uuid() } });
  }, []);

  const updateExpense = useCallback((expense: Expense) => {
    dispatch({ type: "UPDATE_EXPENSE", payload: expense });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    dispatch({ type: "DELETE_EXPENSE", payload: id });
  }, []);

  const addSettlement = useCallback((settlement: Omit<Settlement, "id">) => {
    dispatch({ type: "ADD_SETTLEMENT", payload: { ...settlement, id: uuid() } });
  }, []);

  const deleteSettlement = useCallback((id: string) => {
    dispatch({ type: "DELETE_SETTLEMENT", payload: id });
  }, []);

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
        addUser,
        updateUser,
        deleteUser,
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
