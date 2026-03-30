import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const DEBTS_KEY = "da_debts";

export type DebtType = "i_owe" | "they_owe";

export interface Debt {
  id: string;
  type: DebtType;
  person: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  isPaid: boolean;
}

interface DebtsContextValue {
  debts: Debt[];
  isLoaded: boolean;
  addDebt: (debt: Omit<Debt, "id" | "isPaid">) => Promise<void>;
  markPaid: (id: string) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
}

const DebtsContext = createContext<DebtsContextValue>({
  debts: [],
  isLoaded: false,
  addDebt: async () => {},
  markPaid: async () => {},
  deleteDebt: async () => {},
});

function makeId(): string {
  return `debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function DebtsProvider({ children }: { children: React.ReactNode }) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DEBTS_KEY)
      .then((raw) => {
        if (raw) { try { setDebts(JSON.parse(raw)); } catch {} }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback(async (items: Debt[]) => {
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(items));
    setDebts(items);
  }, []);

  const addDebt = useCallback(
    async (debt: Omit<Debt, "id" | "isPaid">) => {
      await persist([...debts, { ...debt, id: makeId(), isPaid: false }]);
    },
    [debts, persist]
  );

  const markPaid = useCallback(
    async (id: string) => {
      await persist(debts.map((d) => (d.id === id ? { ...d, isPaid: true } : d)));
    },
    [debts, persist]
  );

  const deleteDebt = useCallback(
    async (id: string) => {
      await persist(debts.filter((d) => d.id !== id));
    },
    [debts, persist]
  );

  return (
    <DebtsContext.Provider value={{ debts, isLoaded, addDebt, markPaid, deleteDebt }}>
      {children}
    </DebtsContext.Provider>
  );
}

export function useDebts() {
  return useContext(DebtsContext);
}
