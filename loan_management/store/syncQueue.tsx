// -*- coding: utf-8 -*-
// Generic durable offline sync queue.
//
// Every Odoo *mutation* the app performs (mark paid, reschedule, partial
// payment, status change, post message, …) is enqueued here instead of being
// fired directly. The queue persists to AsyncStorage, drains FIFO whenever the
// device is online and Odoo is configured, classifies failures, and surfaces
// genuine conflicts to the user instead of silently retrying forever.
//
// The local-only Collection ledger does NOT use this queue (by design — see
// refactor decision #1: Collect never calls Odoo). This queue backs the
// Schedules / Invoice / Messaging tabs.

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
  changeScheduleLineState,
  updateScheduleLine,
  addScheduleLine,
  cancelOpenLines,
  updateSchedule,
  setScheduleManualStatus,
  postMessageToOdoo,
  generatePaymentSchedule,
  recordPartialPayment,
  moveUnpaidAmount,
  fetchScheduleLineBasic,
  GenerateScheduleParams,
  PartialPaymentParams,
  MoveUnpaidParams,
} from "../services/loanApi";
import { OdooError, isRetryableError } from "../services/odooClient";
import { ScheduleLineState } from "../types/odoo";
import { useSettings } from "./settingsStore";

const QUEUE_KEY = "loan_management_sync_queue_v1";
const MAX_ATTEMPTS = 6;

// ── Op payloads ────────────────────────────────────────────────────────────

export type SyncOpType =
  | "markPaid"
  | "markUnpaid"
  | "markMissed"
  | "markCanceled"
  | "editLine"
  | "addLine"
  | "cancelOpenLines"
  | "updateScheduleName"
  | "setManualStatus"
  | "generateSchedule"
  | "partialPayment"
  | "moveUnpaid"
  | "postMessage";

type LineStateOp = "markPaid" | "markUnpaid" | "markMissed" | "markCanceled";

export type SyncOpPayload =
  | { type: LineStateOp; lineId: number }
  | {
      type: "editLine";
      lineId: number;
      vals: { payment_date?: string; expected_amount?: number; note?: string };
    }
  | {
      type: "addLine";
      scheduleId: number;
      vals: { payment_date: string; expected_amount: number; note?: string };
    }
  | { type: "cancelOpenLines"; lineIds: number[] }
  | { type: "updateScheduleName"; scheduleId: number; name: string }
  | {
      type: "setManualStatus";
      scheduleId: number;
      status: string | false;
    }
  | { type: "generateSchedule"; params: GenerateScheduleParams }
  | { type: "partialPayment"; params: PartialPaymentParams }
  | { type: "moveUnpaid"; params: MoveUnpaidParams }
  | { type: "postMessage"; invoiceId: number; body: string };

export type QueueOpStatus = "pending" | "syncing" | "failed";

export interface QueueOp {
  id: string;
  createdAt: string;
  status: QueueOpStatus;
  attempts: number;
  /** Human-readable summary for the sync screen, e.g. "Mark SCH/0007 paid". */
  label: string;
  lastError?: string;
  /** True when the failure is a business/conflict error needing a human, not
   *  a transient one the queue can retry on its own. */
  needsAttention?: boolean;
  /** Known server line state at enqueue time (state-convergence guard). */
  expectedLineState?: ScheduleLineState;
  payload: SyncOpPayload;
}

// ── Persistence helpers ────────────────────────────────────────────────────

function makeId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadQueue(): Promise<QueueOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueOp[]) : [];
  } catch {
    return [];
  }
}

async function persistQueue(items: QueueOp[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// ── Per-op execution ───────────────────────────────────────────────────────

const LINE_ACTION: Record<LineStateOp, Parameters<typeof changeScheduleLineState>[3]> = {
  markPaid: "action_mark_paid",
  markUnpaid: "action_mark_unpaid",
  markMissed: "action_mark_missed",
  markCanceled: "action_mark_canceled",
};

const TARGET_STATE: Record<LineStateOp, ScheduleLineState> = {
  markPaid: "paid",
  markUnpaid: "unpaid",
  markMissed: "missed",
  markCanceled: "canceled",
};

/**
 * For simple line-state ops, re-read the server line before applying so the
 * queue is idempotent (a lost success response won't double-apply) and real
 * divergence becomes a surfaced conflict rather than a clobber.
 *
 * Returns "skip" when the line is already in the desired state (treat as done),
 * throws an OdooError("validation") on a genuine conflict, or returns
 * "proceed" otherwise.
 */
async function preflightLineState(
  settings: Parameters<typeof authenticate>[0],
  uid: number,
  op: QueueOp
): Promise<"skip" | "proceed"> {
  if (!(op.payload.type in TARGET_STATE)) return "proceed";
  const opType = op.payload.type as LineStateOp;
  const lineId = (op.payload as { lineId: number }).lineId;

  const line = await fetchScheduleLineBasic(settings, uid, lineId);
  if (!line) {
    throw new OdooError(
      "The payment line no longer exists on the server (it may have been rescheduled or deleted). Discard this action and re-check the schedule.",
      "validation"
    );
  }

  const target = TARGET_STATE[opType];
  if (line.state === target) return "skip"; // already applied — idempotent

  // Divergence from the state we believed when this was queued.
  if (op.expectedLineState && line.state !== op.expectedLineState) {
    throw new OdooError(
      `Conflict: this line is now "${line.state}" on the server but was "${op.expectedLineState}" when the action was queued. Re-check the schedule before retrying.`,
      "validation"
    );
  }
  return "proceed";
}

async function executeOp(
  settings: Parameters<typeof authenticate>[0],
  uid: number,
  op: QueueOp
): Promise<void> {
  const p = op.payload;
  switch (p.type) {
    case "markPaid":
    case "markUnpaid":
    case "markMissed":
    case "markCanceled": {
      const pre = await preflightLineState(settings, uid, op);
      if (pre === "skip") return;
      await changeScheduleLineState(settings, uid, p.lineId, LINE_ACTION[p.type]);
      return;
    }
    case "editLine":
      await updateScheduleLine(settings, uid, p.lineId, p.vals);
      return;
    case "addLine":
      await addScheduleLine(settings, uid, p.scheduleId, p.vals);
      return;
    case "cancelOpenLines":
      await cancelOpenLines(settings, uid, p.lineIds);
      return;
    case "updateScheduleName":
      await updateSchedule(settings, uid, p.scheduleId, { name: p.name });
      return;
    case "setManualStatus":
      await setScheduleManualStatus(settings, uid, p.scheduleId, p.status);
      return;
    case "generateSchedule":
      await generatePaymentSchedule(settings, uid, p.params);
      return;
    case "partialPayment":
      await recordPartialPayment(settings, uid, p.params);
      return;
    case "moveUnpaid":
      await moveUnpaidAmount(settings, uid, p.params);
      return;
    case "postMessage":
      await postMessageToOdoo(settings, uid, p.invoiceId, p.body);
      return;
    default: {
      // Exhaustiveness guard.
      const _never: never = p;
      throw new Error(`Unknown sync op: ${JSON.stringify(_never)}`);
    }
  }
}

// ── Context ────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  label: string;
  expectedLineState?: ScheduleLineState;
}

interface SyncQueueContextValue {
  queue: QueueOp[];
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  enqueue: (payload: SyncOpPayload, opts: EnqueueOptions) => Promise<void>;
  syncNow: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearFailed: () => Promise<void>;
  removeOp: (id: string) => Promise<void>;
}

const SyncQueueContext = createContext<SyncQueueContextValue>({
  queue: [],
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  enqueue: async () => {},
  syncNow: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
  removeOp: async () => {},
});

export function SyncQueueProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [queue, setQueue] = useState<QueueOp[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;

    const current = await loadQueue();
    if (!current.some((o) => o.status === "pending")) return;

    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    const s = settingsRef.current;
    if (!s.baseUrl || !s.db || !s.username || !s.password) return;

    syncingRef.current = true;
    setIsSyncing(true);

    let working = [...current];
    try {
      let uid: number;
      try {
        uid = await authenticate(s);
      } catch (e) {
        // Auth failed → leave everything pending, try again later.
        const msg = e instanceof Error ? e.message : String(e);
        working = working.map((o) =>
          o.status === "pending" ? { ...o, lastError: msg } : o
        );
        await persistQueue(working);
        setQueue(working);
        return;
      }

      // FIFO over a snapshot of the currently-pending ops.
      const pendingIds = working
        .filter((o) => o.status === "pending")
        .map((o) => o.id);

      for (const id of pendingIds) {
        const op = working.find((o) => o.id === id);
        if (!op) continue;

        op.status = "syncing";
        await persistQueue(working);
        setQueue([...working]);

        try {
          await executeOp(s, uid, op);
          working = working.filter((o) => o.id !== id); // success → drop
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const retryable = isRetryableError(e);
          const networkDown =
            e instanceof OdooError &&
            (e.kind === "network" || e.kind === "auth");

          op.attempts += 1;

          if (retryable && op.attempts < MAX_ATTEMPTS) {
            op.status = "pending";
            op.lastError = msg;
            await persistQueue(working);
            setQueue([...working]);
            // Connectivity/auth problems affect every op — stop this run
            // and let the next online trigger resume.
            if (networkDown) break;
          } else {
            op.status = "failed";
            op.lastError = msg;
            op.needsAttention = !retryable;
            await persistQueue(working);
            setQueue([...working]);
          }
        }
      }

      await persistQueue(working);
      setQueue([...working]);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // Drain whenever connectivity is (re)gained.
  useEffect(() => {
    if (isOnline) {
      syncNow();
    }
  }, [isOnline, syncNow]);

  const enqueue = useCallback(
    async (payload: SyncOpPayload, opts: EnqueueOptions) => {
      const op: QueueOp = {
        id: makeId(),
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
        label: opts.label,
        expectedLineState: opts.expectedLineState,
        payload,
      };
      const current = await loadQueue();
      const next = [...current, op];
      await persistQueue(next);
      setQueue(next);

      const net = await NetInfo.fetch();
      if (net.isConnected) {
        syncNow();
      }
    },
    [syncNow]
  );

  const retryFailed = useCallback(async () => {
    const current = await loadQueue();
    const next = current.map((o) =>
      o.status === "failed"
        ? { ...o, status: "pending" as QueueOpStatus, attempts: 0, lastError: undefined, needsAttention: undefined }
        : o
    );
    await persistQueue(next);
    setQueue(next);
    syncNow();
  }, [syncNow]);

  const clearFailed = useCallback(async () => {
    const current = await loadQueue();
    const next = current.filter((o) => o.status !== "failed");
    await persistQueue(next);
    setQueue(next);
  }, []);

  const removeOp = useCallback(async (id: string) => {
    const current = await loadQueue();
    const next = current.filter((o) => o.id !== id);
    await persistQueue(next);
    setQueue(next);
  }, []);

  const pendingCount = queue.filter(
    (o) => o.status === "pending" || o.status === "syncing"
  ).length;
  const failedCount = queue.filter((o) => o.status === "failed").length;

  return (
    <SyncQueueContext.Provider
      value={{
        queue,
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        enqueue,
        syncNow,
        retryFailed,
        clearFailed,
        removeOp,
      }}
    >
      {children}
    </SyncQueueContext.Provider>
  );
}

export function useSyncQueue() {
  return useContext(SyncQueueContext);
}
