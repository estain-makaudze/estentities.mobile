// -*- coding: utf-8 -*-
// Categories store: caches Odoo categories locally and supports offline creation.

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
import { authenticate, createCategory, getCategories } from "../services/odooApi";
import { OdooCategory } from "../types/odoo";
import { useSettings } from "./settingsStore";

const CATEGORIES_KEY = "da_categories";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalCategory extends OdooCategory {
  /** True when this category was created locally and has not been synced to Odoo yet. */
  isLocal: boolean;
  /** Sync status for locally-created categories. */
  syncStatus?: "pending" | "failed";
}

interface CategoriesContextValue {
  categories: LocalCategory[];
  isLoading: boolean;
  error: string | null;
  /** Pull latest categories from Odoo and merge with any local-only entries. */
  refreshCategories: () => Promise<void>;
  /** Create a new category. Works offline – will be synced when connectivity returns. */
  addCategory: (name: string, entry_type: "expense" | "income") => Promise<LocalCategory>;
  /** Push pending local categories to Odoo. Called automatically when online. */
  syncPending: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Negative IDs indicate locally-created, not-yet-synced categories. */
let tempIdCounter = -1;
function nextTempId(): number {
  return tempIdCounter--;
}

async function loadCached(): Promise<LocalCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function persist(cats: LocalCategory[]): Promise<void> {
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

// ── Context ───────────────────────────────────────────────────────────────────

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: [],
  isLoading: false,
  error: null,
  refreshCategories: async () => {},
  addCategory: async () => ({
    id: 0,
    name: "",
    entry_type: "expense",
    color: 0,
    isLocal: false,
  }),
  syncPending: async () => {},
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const isConfigured = !!(
    settings.baseUrl && settings.db && settings.username && settings.password
  );

  // Load cached categories on mount
  useEffect(() => {
    loadCached().then(setCategories);
  }, []);

  // ── Sync pending local categories to Odoo ───────────────────────────────────
  const syncPending = useCallback(async () => {
    if (syncingRef.current || !isConfigured) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    const cached = await loadCached();
    const pending = cached.filter((c) => c.isLocal && c.syncStatus === "pending");
    if (pending.length === 0) return;

    syncingRef.current = true;
    let uid: number;
    try {
      uid = await authenticate(settings);
    } catch {
      syncingRef.current = false;
      return;
    }

    let updated = [...cached];
    for (const cat of pending) {
      try {
        const newId = await createCategory(settings, uid, {
          name: cat.name,
          entry_type: cat.entry_type,
        });
        // Replace temp entry with real Odoo ID
        updated = updated.map((c) =>
          c.id === cat.id
            ? { ...c, id: newId, isLocal: false, syncStatus: undefined }
            : c
        );
      } catch {
        updated = updated.map((c) =>
          c.id === cat.id ? { ...c, syncStatus: "failed" as const } : c
        );
      }
    }

    await persist(updated);
    setCategories(updated);
    syncingRef.current = false;
  }, [isConfigured, settings]);

  // ── Fetch from Odoo and merge with local-only entries ──────────────────────
  const refreshCategories = useCallback(async () => {
    if (!isConfigured) return;
    setIsLoading(true);
    setError(null);
    try {
      const uid = await authenticate(settings);
      const remote = await getCategories(settings, uid);
      const cached = await loadCached();
      // Keep locally-created categories that are still pending sync
      const localOnly = cached.filter((c) => c.isLocal);
      const merged: LocalCategory[] = [
        ...remote.map((c): LocalCategory => ({ ...c, isLocal: false })),
        ...localOnly,
      ];
      await persist(merged);
      setCategories(merged);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, settings]);

  // Auto-refresh when connectivity is restored
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      if (online && isConfigured) {
        syncPending().then(() => refreshCategories());
      }
    });
    return () => unsub();
  }, [isConfigured, refreshCategories, syncPending]);

  // Initial fetch when configured
  useEffect(() => {
    if (isConfigured) {
      refreshCategories();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured]);

  // ── Add a new category (offline-safe) ──────────────────────────────────────
  const addCategory = useCallback(
    async (name: string, entry_type: "expense" | "income"): Promise<LocalCategory> => {
      const newCat: LocalCategory = {
        id: nextTempId(),
        name: name.trim(),
        entry_type,
        color: 0,
        isLocal: true,
        syncStatus: "pending",
      };
      const cached = await loadCached();
      const updated = [...cached, newCat];
      await persist(updated);
      setCategories(updated);
      // Attempt immediate sync if online
      syncPending();
      return newCat;
    },
    [syncPending]
  );

  return (
    <CategoriesContext.Provider
      value={{ categories, isLoading, error, refreshCategories, addCategory, syncPending }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
