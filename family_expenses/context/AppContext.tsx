import React, { useCallback, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { useDataVersion } from "../db/events";
import { getOne, listAll, remove, save } from "../db/repo";
import { onAfterSync } from "../services/syncEngine";
import type { Budget, Category, Expense, Recurring, Settlement } from "../types";
import { stableId, newId } from "../utils/ids";
import { registerBackgroundTask } from "../tasks/background";
import { checkBudgetAlerts, scheduleBillReminders, scheduleDailyReminders } from "../utils/notify";
import { generateDueRecurring } from "../utils/recurring";
import { useAuth } from "./AuthContext";
import { useHousehold } from "./HouseholdContext";

/**
 * Family data API. Every mutation writes to SQLite + the outbox synchronously
 * (instant UI, works offline); the sync engine uploads it when online.
 */

type New<T> = Omit<T, "id" | "householdId">;

export function useApp() {
  const { userId } = useAuth();
  const { household } = useHousehold();
  const hh = household?.id ?? "";
  const version = useDataVersion();

  const categories = useMemo(() => {
    void version;
    return hh ? listAll<Category>("categories", hh, "sort_order, name") : [];
  }, [hh, version]);

  const budgets = useMemo(() => {
    void version;
    return hh ? listAll<Budget>("budgets", hh).filter((b) => b.amount > 0) : [];
  }, [hh, version]);

  const recurring = useMemo(() => {
    void version;
    return hh ? listAll<Recurring>("recurring", hh, "next_due") : [];
  }, [hh, version]);

  const categoryById = useCallback(
    (id: string | null | undefined) => categories.find((c) => c.id === id) ?? null,
    [categories]
  );

  // ── Expenses ──
  const addExpense = useCallback(
    (e: New<Expense>) => {
      const id = newId();
      save([["expenses", { ...e, id, householdId: hh, createdBy: userId }]], `Add ${e.description}`);
      return id;
    },
    [hh, userId]
  );
  const updateExpense = useCallback((e: Expense) => save([["expenses", e]], `Edit ${e.description}`), []);
  const deleteExpense = useCallback((id: string) => remove("expenses", id, "Delete expense"), []);
  const getExpense = useCallback((id: string) => getOne<Expense>("expenses", id), []);

  // ── Settlements ──
  const addSettlement = useCallback(
    (s: New<Settlement>) => save([["settlements", { ...s, id: newId(), householdId: hh }]], "Record payment"),
    [hh]
  );
  const deleteSettlement = useCallback((id: string) => remove("settlements", id, "Delete payment"), []);

  // ── Categories ──
  const saveCategory = useCallback(
    (c: Partial<Category> & Pick<Category, "name" | "emoji">) => {
      const full: Category = {
        id: c.id ?? newId(),
        householdId: hh,
        name: c.name,
        emoji: c.emoji,
        color: c.color ?? null,
        defaultSplits: c.defaultSplits ?? null,
        sortOrder: c.sortOrder ?? categories.length,
      };
      save([["categories", full]], `Category ${c.name}`);
    },
    [hh, categories.length]
  );
  const deleteCategory = useCallback((id: string) => remove("categories", id, "Delete category"), []);

  // ── Budgets (one per category per family; deterministic id merges offline duplicates) ──
  const setBudget = useCallback(
    (categoryId: string | null, amount: number | null) => {
      // Removing = amount 0 (not a delete): server deletes are final, and the same
      // deterministic id must stay usable if the budget is set again later.
      const id = stableId("budget", hh, categoryId ?? "total");
      const value = amount === null || amount <= 0 ? 0 : amount;
      save([["budgets", { id, householdId: hh, categoryId, amount: value }]], value ? "Set budget" : "Remove budget");
    },
    [hh]
  );

  // ── Recurring ──
  const saveRecurring = useCallback(
    (r: Omit<Recurring, "householdId" | "id"> & { id?: string }) => {
      save([["recurring", { ...r, id: r.id ?? newId(), householdId: hh }]], `Recurring ${r.description}`);
      if (userId) generateDueRecurring(hh, userId);
    },
    [hh, userId]
  );
  const deleteRecurring = useCallback((id: string) => remove("recurring", id, "Delete recurring"), []);

  return {
    householdId: hh,
    categories,
    budgets,
    recurring,
    categoryById,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpense,
    addSettlement,
    deleteSettlement,
    saveCategory,
    deleteCategory,
    setBudget,
    saveRecurring,
    deleteRecurring,
  };
}

/**
 * Background housekeeping: create due recurring expenses, fire budget alerts,
 * keep bill reminders scheduled. Runs on open, on foreground and after sync.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { household } = useHousehold();
  const hh = household?.id;
  const currency = household?.currency ?? "USD";
  const version = useDataVersion();

  useEffect(() => {
    if (!hh || !userId) return;
    const run = () => {
      try {
        generateDueRecurring(hh, userId);
        void scheduleBillReminders(hh, currency).catch(() => {});
      } catch (e) {
        console.warn("recurring generation failed", e);
      }
    };
    run();
    const off = onAfterSync(run);
    const sub = AppState.addEventListener("change", (s) => s === "active" && run());
    return () => {
      off();
      sub.remove();
    };
  }, [hh, userId, currency]);

  // Keep syncing / reminding while the app is closed.
  useEffect(() => {
    if (userId) void registerBackgroundTask();
  }, [userId]);

  // Budget thresholds and "entered today?" can change with any data change (local or pulled).
  useEffect(() => {
    if (!hh || !userId) return;
    const t = setTimeout(() => {
      void checkBudgetAlerts(hh, currency).catch(() => {});
      void scheduleDailyReminders(hh, userId).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [hh, userId, currency, version]);

  return <>{children}</>;
}
