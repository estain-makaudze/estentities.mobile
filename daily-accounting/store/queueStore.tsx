// -*- coding: utf-8 -*-
// Offline queue: stores pending entry operations locally and syncs when online.

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  authenticate,
  createEntry,
  getCurrencyIdByName,
  searchTodayEntry,
  updateEntryAmount,
} from "../services/odooApi";
import { useSettings } from "./settingsStore";

const QUEUE_KEY = "offline_entry_queue";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueueItemStatus = "pending" | "syncing" | "failed";

export interface QueueItem {
  id: string;             // local UUID
  createdAt: string;      // ISO timestamp
  status: QueueItemStatus;
  errorMsg?: string;
  // Entry data
  date: string;           // YYYY-MM-DD
  categoryId: number;
  categoryName: string;
  currencyCode: string;
  amount: number;
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function persistQueue(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// ── Context ───────────────────────────────────────────────────────────────────

interface QueueContextValue {
  queue: QueueItem[];
  isOnline: boolean;
  isSyncing: boolean;
  enqueue: (item: Omit<QueueItem, "id" | "createdAt" | "status">) => Promise<void>;
  syncNow: () => Promise<void>;
  clearFailed: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

const QueueContext = createContext<QueueContextValue>({
  queue: [],
  isOnline: true,
  isSyncing: false,
  enqueue: async () => {},
  syncNow: async () => {},
  clearFailed: async () => {},
  retryFailed: async () => {},
});

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Load queue from storage on mount
  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

  // Monitor network state
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
    });
    return () => unsub();
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const current = await loadQueue();
    const pending = current.filter((i) => i.status === "pending" || i.status === "failed");
    if (pending.length === 0) return;

    const isConnected = (await NetInfo.fetch()).isConnected;
    if (!isConnected) return;

    const configured =
      settings.baseUrl && settings.db && settings.username && settings.password;
    if (!configured) return;

    syncingRef.current = true;
    setIsSyncing(true);

    // Mark all pending as syncing
    let updated = current.map((i) =>
      i.status === "pending" || i.status === "failed"
        ? { ...i, status: "syncing" as QueueItemStatus }
        : i
    );
    await persistQueue(updated);
    setQueue([...updated]);

    let uid: number;
    try {
      uid = await authenticate(settings);
    } catch {
      // Can't authenticate — mark them all failed
      updated = updated.map((i) =>
        i.status === "syncing"
          ? { ...i, status: "failed" as QueueItemStatus, errorMsg: "Authentication failed" }
          : i
      );
      await persistQueue(updated);
      setQueue([...updated]);
      syncingRef.current = false;
      setIsSyncing(false);
      return;
    }

    for (const item of updated.filter((i) => i.status === "syncing")) {
      try {
        const currencyId = await getCurrencyIdByName(settings, uid, item.currencyCode);
        const existing = await searchTodayEntry(settings, uid, item.categoryId, item.date);

        if (existing) {
          await updateEntryAmount(settings, uid, existing.id, existing.amount + item.amount);
        } else {
          await createEntry(settings, uid, {
            name: `${item.categoryName} – ${item.date}`,
            date: item.date,
            category_id: item.categoryId,
            amount: item.amount,
            currency_id: currencyId,
            note: item.note,
            state: "draft",
          });
        }

        // Remove synced item from queue
        updated = updated.filter((i) => i.id !== item.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        updated = updated.map((i) =>
          i.id === item.id
            ? { ...i, status: "failed" as QueueItemStatus, errorMsg: msg }
            : i
        );
      }
    }

    await persistQueue(updated);
    setQueue([...updated]);
    syncingRef.current = false;
    setIsSyncing(false);
  }, [settings]);

  const enqueue = useCallback(
    async (item: Omit<QueueItem, "id" | "createdAt" | "status">) => {
      const newItem: QueueItem = {
        ...item,
        id: makeId(),
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      const current = await loadQueue();
      const updated = [...current, newItem];
      await persistQueue(updated);
      setQueue(updated);

      // Attempt immediate sync if online
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        syncNow();
      }
    },
    [syncNow]
  );

  const clearFailed = useCallback(async () => {
    const current = await loadQueue();
    const updated = current.filter((i) => i.status !== "failed");
    await persistQueue(updated);
    setQueue(updated);
  }, []);

  const retryFailed = useCallback(async () => {
    const current = await loadQueue();
    const updated = current.map((i) =>
      i.status === "failed" ? { ...i, status: "pending" as QueueItemStatus, errorMsg: undefined } : i
    );
    await persistQueue(updated);
    setQueue(updated);
    syncNow();
  }, [syncNow]);

  return (
    <QueueContext.Provider
      value={{ queue, isOnline, isSyncing, enqueue, syncNow, clearFailed, retryFailed }}
    >
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue() {
  return useContext(QueueContext);
}

