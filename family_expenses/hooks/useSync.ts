import { useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../services/supabase";
import { Expense, Settlement } from "../types";

const QUEUE_KEY = "@family_expenses:write_queue";

type QueuedWrite =
  | { type: "ADD_EXPENSE"; payload: Omit<Expense, "id">; householdId: string }
  | { type: "UPDATE_EXPENSE"; payload: Expense; householdId: string }
  | { type: "DELETE_EXPENSE"; payload: string; householdId: string }
  | { type: "ADD_SETTLEMENT"; payload: Omit<Settlement, "id">; householdId: string }
  | { type: "DELETE_SETTLEMENT"; payload: string; householdId: string };

async function loadQueue(): Promise<QueuedWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedWrite[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function flushQueue(): Promise<void> {
  const queue = await loadQueue();
  if (queue.length === 0) return;

  const remaining: QueuedWrite[] = [];

  for (const item of queue) {
    let success = false;
    try {
      switch (item.type) {
        case "ADD_EXPENSE": {
          const exp = item.payload;
          const { error } = await supabase.from("expenses").insert({
            household_id: item.householdId,
            paid_by: exp.paidBy,
            amount: exp.amount,
            description: exp.description,
            date: exp.date.substring(0, 10),
            category: exp.category,
            note: exp.note ?? null,
            split_ratio: exp.splits ?? null,
          });
          success = !error;
          break;
        }
        case "UPDATE_EXPENSE": {
          const exp = item.payload;
          const { error } = await supabase
            .from("expenses")
            .update({
              paid_by: exp.paidBy,
              amount: exp.amount,
              description: exp.description,
              date: exp.date.substring(0, 10),
              category: exp.category,
              note: exp.note ?? null,
              split_ratio: exp.splits ?? null,
            })
            .eq("id", exp.id);
          success = !error;
          break;
        }
        case "DELETE_EXPENSE": {
          const { error } = await supabase
            .from("expenses")
            .delete()
            .eq("id", item.payload);
          success = !error;
          break;
        }
        case "ADD_SETTLEMENT": {
          const s = item.payload;
          const { error } = await supabase.from("settlements").insert({
            household_id: item.householdId,
            from_user_id: s.fromUserId,
            to_user_id: s.toUserId,
            amount: s.amount,
            date: s.date.substring(0, 10),
            note: s.note ?? null,
          });
          success = !error;
          break;
        }
        case "DELETE_SETTLEMENT": {
          const { error } = await supabase
            .from("settlements")
            .delete()
            .eq("id", item.payload);
          success = !error;
          break;
        }
      }
    } catch {
      success = false;
    }

    if (!success) {
      remaining.push(item);
    }
  }

  await saveQueue(remaining);
}

/**
 * Flushes offline write queue on mount and whenever the Supabase auth
 * session becomes available (i.e. after coming back online or re-opening
 * the app with a valid session).
 */
export function useSync() {
  const flushing = useRef(false);

  const tryFlush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      await flushQueue();
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    // Flush on mount.
    tryFlush();

    // Re-flush whenever the auth session becomes active.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          tryFlush();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [tryFlush]);

  return { flushQueue: tryFlush };
}
