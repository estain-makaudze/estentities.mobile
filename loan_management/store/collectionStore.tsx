// -*- coding: utf-8 -*-
// Local-only payment collection ledger.
// Records are never auto-synced – the user manually taps "Record to Odoo"
// for each entry, which calls action_mark_paid on the schedule line.

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "loan_management_collections_v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionStatus = "not_recorded" | "recorded";

export interface LocalCollection {
  // Identity
  id: string;
  createdAt: string;             // ISO timestamp

  // Odoo line reference (used when recording)
  scheduleLineId: number;
  scheduleId: number;
  scheduleName: string;
  invoiceName: string;
  partnerName: string;
  expectedAmount: number;
  linePaymentDate: string;       // YYYY-MM-DD (when the instalment was due)
  currency: string;

  // What was actually collected today
  collectedAmount: number;
  collectedDate: string;         // YYYY-MM-DD
  note: string;

  // Odoo sync state
  status: CollectionStatus;
  recordedAt: string | null;     // ISO timestamp when recorded
}

// ── Context ───────────────────────────────────────────────────────────────────

interface CollectionContextValue {
  collections: LocalCollection[];
  isLoaded: boolean;
  addCollection: (
    data: Omit<LocalCollection, "id" | "createdAt" | "status" | "recordedAt">
  ) => Promise<LocalCollection>;
  markRecorded: (id: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
}

const CollectionContext = createContext<CollectionContextValue>({
  collections: [],
  isLoaded: false,
  addCollection: async () => { throw new Error("not mounted"); },
  markRecorded: async () => {},
  deleteCollection: async () => {},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<LocalCollection[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalCollection[]) : [];
  } catch {
    return [];
  }
}

async function save(items: LocalCollection[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<LocalCollection[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    load().then(setCollections).finally(() => setIsLoaded(true));
  }, []);

  const addCollection = useCallback(
    async (
      data: Omit<LocalCollection, "id" | "createdAt" | "status" | "recordedAt">
    ): Promise<LocalCollection> => {
      const entry: LocalCollection = {
        ...data,
        id: makeId(),
        createdAt: new Date().toISOString(),
        status: "not_recorded",
        recordedAt: null,
      };
      const next = [entry, ...collections];
      await save(next);
      setCollections(next);
      return entry;
    },
    [collections]
  );

  const markRecorded = useCallback(
    async (id: string) => {
      const next = collections.map((c) =>
        c.id === id
          ? { ...c, status: "recorded" as CollectionStatus, recordedAt: new Date().toISOString() }
          : c
      );
      await save(next);
      setCollections(next);
    },
    [collections]
  );

  const deleteCollection = useCallback(
    async (id: string) => {
      const next = collections.filter((c) => c.id !== id);
      await save(next);
      setCollections(next);
    },
    [collections]
  );

  return (
    <CollectionContext.Provider
      value={{ collections, isLoaded, addCollection, markRecorded, deleteCollection }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollections() {
  return useContext(CollectionContext);
}

