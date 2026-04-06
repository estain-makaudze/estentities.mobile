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
  fetchAllScheduleLines,
  fetchDueScheduleLines,
  fetchLoanInvoices,
  fetchLoanSchedules,
} from "../services/loanApi";
import {
  CachedCollection,
  LoanInvoice,
  LoanSchedule,
  LoanScheduleLine,
} from "../types/odoo";
import { useSettings } from "./settingsStore";

const CACHE_KEY = "loan_management_mobile_cache_v2";
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersistedCache {
  invoices: CachedCollection<LoanInvoice>;
  schedules: CachedCollection<LoanSchedule>;
  dueLines: CachedCollection<LoanScheduleLine>;
  allLines: CachedCollection<LoanScheduleLine>;
}

interface CacheContextValue {
  invoices: CachedCollection<LoanInvoice>;
  schedules: CachedCollection<LoanSchedule>;
  dueLines: CachedCollection<LoanScheduleLine>;
  allLines: CachedCollection<LoanScheduleLine>;
  isLoaded: boolean;
  isOnline: boolean;
  refreshingInvoices: boolean;
  refreshingSchedules: boolean;
  refreshingDueLines: boolean;
  refreshInvoices: () => Promise<void>;
  refreshSchedules: () => Promise<void>;
  refreshAll: () => Promise<void>;
  updateScheduleLines: (scheduleId: number, lines: LoanScheduleLine[]) => Promise<void>;
}

const emptyCollection = <T,>(): CachedCollection<T> => ({
  items: [],
  fetchedAt: null,
});

const CacheContext = createContext<CacheContextValue>({
  invoices: emptyCollection<LoanInvoice>(),
  schedules: emptyCollection<LoanSchedule>(),
  dueLines: emptyCollection<LoanScheduleLine>(),
  allLines: emptyCollection<LoanScheduleLine>(),
  isLoaded: false,
  isOnline: true,
  refreshingInvoices: false,
  refreshingSchedules: false,
  refreshingDueLines: false,
  refreshInvoices: async () => {},
  refreshSchedules: async () => {},
  refreshAll: async () => {},
  updateScheduleLines: async () => {},
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function isConfigured(s: { baseUrl: string; db: string; username: string; password: string }) {
  return !!(s.baseUrl && s.db && s.username && s.password);
}

async function loadPersistedCache(): Promise<PersistedCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return { invoices: emptyCollection(), schedules: emptyCollection(), dueLines: emptyCollection(), allLines: emptyCollection() };
    const p = JSON.parse(raw) as Partial<PersistedCache>;
    return {
      invoices: p.invoices ?? emptyCollection(),
      schedules: p.schedules ?? emptyCollection(),
      dueLines: p.dueLines ?? emptyCollection(),
      allLines: p.allLines ?? emptyCollection(),
    };
  } catch {
    return { invoices: emptyCollection(), schedules: emptyCollection(), dueLines: emptyCollection(), allLines: emptyCollection() };
  }
}

async function persistCache(next: PersistedCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CacheProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoaded: settingsLoaded } = useSettings();

  const [invoices, setInvoices] = useState<CachedCollection<LoanInvoice>>(emptyCollection());
  const [schedules, setSchedules] = useState<CachedCollection<LoanSchedule>>(emptyCollection());
  const [dueLines, setDueLines] = useState<CachedCollection<LoanScheduleLine>>(emptyCollection());
  const [allLines, setAllLines] = useState<CachedCollection<LoanScheduleLine>>(emptyCollection());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [refreshingInvoices, setRefreshingInvoices] = useState(false);
  const [refreshingSchedules, setRefreshingSchedules] = useState(false);
  const [refreshingDueLines, setRefreshingDueLines] = useState(false);
  const autoRefreshRef = useRef(0);

  const invoicesRef = useRef<CachedCollection<LoanInvoice>>(emptyCollection());
  const schedulesRef = useRef<CachedCollection<LoanSchedule>>(emptyCollection());
  const dueLinesRef = useRef<CachedCollection<LoanScheduleLine>>(emptyCollection());
  const allLinesRef = useRef<CachedCollection<LoanScheduleLine>>(emptyCollection());

  const flush = useCallback(
    async (
      ni: CachedCollection<LoanInvoice>,
      ns: CachedCollection<LoanSchedule>,
      nd: CachedCollection<LoanScheduleLine>,
      nal: CachedCollection<LoanScheduleLine>
    ) => {
      invoicesRef.current = ni;
      schedulesRef.current = ns;
      dueLinesRef.current = nd;
      allLinesRef.current = nal;
      setInvoices(ni);
      setSchedules(ns);
      setDueLines(nd);
      setAllLines(nal);
      await persistCache({ invoices: ni, schedules: ns, dueLines: nd, allLines: nal });
    },
    []
  );

  useEffect(() => {
    loadPersistedCache().then((cache) => {
      invoicesRef.current = cache.invoices;
      schedulesRef.current = cache.schedules;
      dueLinesRef.current = cache.dueLines;
      allLinesRef.current = cache.allLines;
      setInvoices(cache.invoices);
      setSchedules(cache.schedules);
      setDueLines(cache.dueLines);
      setAllLines(cache.allLines);
    }).finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });
    NetInfo.fetch().then((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  const refreshInvoices = useCallback(async () => {
    if (!isConfigured(settings)) throw new Error("Configure Odoo connection first.");
    setRefreshingInvoices(true);
    try {
      const uid = await authenticate(settings);
      const items = await fetchLoanInvoices(settings, uid);
      await flush({ items, fetchedAt: new Date().toISOString() }, schedulesRef.current, dueLinesRef.current, allLinesRef.current);
    } finally {
      setRefreshingInvoices(false);
    }
  }, [flush, settings]);

  const refreshSchedules = useCallback(async () => {
    if (!isConfigured(settings)) throw new Error("Configure Odoo connection first.");
    setRefreshingSchedules(true);
    try {
      const uid = await authenticate(settings);
      const fetchedAt = new Date().toISOString();
      const [scheduleItems, lineItems] = await Promise.all([
        fetchLoanSchedules(settings, uid),
        fetchAllScheduleLines(settings, uid),
      ]);
      await flush(invoicesRef.current, { items: scheduleItems, fetchedAt }, dueLinesRef.current, { items: lineItems, fetchedAt });
    } finally {
      setRefreshingSchedules(false);
    }
  }, [flush, settings]);

  const refreshAll = useCallback(async () => {
    if (!isConfigured(settings)) throw new Error("Configure Odoo connection first.");
    setRefreshingInvoices(true);
    setRefreshingSchedules(true);
    setRefreshingDueLines(true);
    try {
      const uid = await authenticate(settings);
      const today = todayString();
      const [invoiceItems, scheduleItems, dueLineItems, lineItems] = await Promise.all([
        fetchLoanInvoices(settings, uid),
        fetchLoanSchedules(settings, uid),
        fetchDueScheduleLines(settings, uid, today),
        fetchAllScheduleLines(settings, uid),
      ]);
      const fetchedAt = new Date().toISOString();
      await flush(
        { items: invoiceItems, fetchedAt },
        { items: scheduleItems, fetchedAt },
        { items: dueLineItems, fetchedAt },
        { items: lineItems, fetchedAt }
      );
    } finally {
      setRefreshingInvoices(false);
      setRefreshingSchedules(false);
      setRefreshingDueLines(false);
    }
  }, [flush, settings]);

  // Update lines for a single schedule in the allLines cache (called after mutations)
  const updateScheduleLines = useCallback(async (scheduleId: number, fresh: LoanScheduleLine[]) => {
    const other = allLinesRef.current.items.filter(
      (l) => !(Array.isArray(l.schedule_id) && l.schedule_id[0] === scheduleId)
    );
    const updated: CachedCollection<LoanScheduleLine> = {
      items: [...other, ...fresh],
      fetchedAt: new Date().toISOString(),
    };
    await flush(invoicesRef.current, schedulesRef.current, dueLinesRef.current, updated);
  }, [flush]);

  // Background auto-refresh when coming online or first load
  useEffect(() => {
    if (!isLoaded || !settingsLoaded || !isOnline || !isConfigured(settings)) return;
    const lastFetchedAt = Math.max(
      invoices.fetchedAt ? new Date(invoices.fetchedAt).getTime() : 0,
      schedules.fetchedAt ? new Date(schedules.fetchedAt).getTime() : 0
    );
    const now = Date.now();
    if (now - Math.max(lastFetchedAt, autoRefreshRef.current) < AUTO_REFRESH_INTERVAL_MS) return;
    autoRefreshRef.current = now;
    refreshAll().catch(() => {});
  }, [invoices.fetchedAt, isLoaded, isOnline, refreshAll, schedules.fetchedAt, settings, settingsLoaded]);

  return (
    <CacheContext.Provider
      value={{
        invoices,
        schedules,
        dueLines,
        allLines,
        isLoaded,
        isOnline,
        refreshingInvoices,
        refreshingSchedules,
        refreshingDueLines,
        refreshInvoices,
        refreshSchedules,
        refreshAll,
        updateScheduleLines,
      }}
    >
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  return useContext(CacheContext);
}
