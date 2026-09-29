import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";
import { db, getMeta } from "../db/database";
import { subscribeData, notifyDataChanged } from "../db/events";
import { applyPull, onLocalWrite, type PullResponse } from "../db/repo";
import { api, ApiError, isRetryableError, loadToken } from "./api";

/**
 * Offline-first sync engine (module singleton).
 *
 *  push:  outbox (FIFO, batches of 100) → POST /sync/push
 *         applied / duplicate / stale → op removed
 *         rejected (validation)       → op marked failed, shown in Sync screen
 *  pull:  GET /sync/pull?since=<cursor> → applyPull()
 *
 * Triggers: coming online, app foreground, every 60 s in foreground, shortly
 * after each local write, and manual "Sync now". Failures back off
 * exponentially (5 s → 5 min).
 */

export type SyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Server rejected our token (device revoked) */
  signedOut: boolean;
};

let state: SyncState = {
  isOnline: true,
  isSyncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
  signedOut: false,
};
const listeners = new Set<() => void>();
const afterSyncHooks = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncState() {
  return state;
}

export function subscribeSync(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Run after every successful sync (recurring generation, budget alerts…). */
export function onAfterSync(fn: () => void) {
  afterSyncHooks.add(fn);
  return () => {
    afterSyncHooks.delete(fn);
  };
}

function refreshCounts() {
  const rows = db.getAllSync<{ status: string; n: number }>(
    "SELECT status, count(*) AS n FROM outbox GROUP BY status"
  );
  const pending = rows.find((r) => r.status === "pending")?.n ?? 0;
  const failed = rows.find((r) => r.status === "failed")?.n ?? 0;
  if (pending !== state.pending || failed !== state.failed) setState({ pending, failed });
}

// ── Core ────────────────────────────────────────────────────────────────────

type OutboxRow = {
  op_id: string; entity: string; record_id: string; household_id: string;
  deleted: number; data: string | null; client_updated_at: string;
};
type PushResult = { opId: string; status: "applied" | "duplicate" | "stale" | "rejected"; error?: string };

let running: Promise<void> | null = null;
let again = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function push(): Promise<{ stale: boolean }> {
  let stale = false;
  for (;;) {
    const ops = db.getAllSync<OutboxRow>(
      "SELECT * FROM outbox WHERE status = 'pending' ORDER BY seq LIMIT 100"
    );
    if (ops.length === 0) return { stale };
    const { results } = await api<{ results: PushResult[] }>("POST", "/sync/push", {
      ops: ops.map((o) => ({
        opId: o.op_id,
        entity: o.entity,
        id: o.record_id,
        householdId: o.household_id,
        deleted: !!o.deleted,
        data: o.data ? JSON.parse(o.data) : null,
        clientUpdatedAt: o.client_updated_at,
      })),
    });
    db.withTransactionSync(() => {
      for (const r of results) {
        if (r.status === "rejected") {
          db.runSync(
            "UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE op_id = ?",
            r.error ?? "Rejected by server", r.opId
          );
        } else {
          if (r.status === "stale") stale = true;
          db.runSync("DELETE FROM outbox WHERE op_id = ?", r.opId);
        }
      }
    });
    refreshCounts();
  }
}

async function pull(full: boolean) {
  const since = full ? 0 : Number(getMeta("cursor") ?? 0);
  const res = await api<PullResponse>("GET", `/sync/pull?since=${since}`);
  applyPull(res, since === 0);
}

async function runOnce(opts: { full?: boolean }) {
  const token = await loadToken();
  if (!token || state.signedOut) return;
  setState({ isSyncing: true });
  try {
    const { stale } = await push();
    // A stale push means the server kept a newer version we may already have
    // passed with our cursor — re-pull everything (cheap at household scale).
    await pull(!!opts.full || stale);
    failures = 0;
    setState({ lastSyncAt: new Date().toISOString(), lastError: null });
    afterSyncHooks.forEach((h) => {
      try {
        h();
      } catch (e) {
        console.warn("after-sync hook failed", e);
      }
    });
  } catch (e) {
    const err = e as Error;
    if (err instanceof ApiError && err.kind === "auth") {
      setState({ signedOut: true, lastError: err.message });
    } else {
      setState({ lastError: err.message });
      if (isRetryableError(err)) scheduleRetry();
    }
  } finally {
    setState({ isSyncing: false });
    refreshCounts();
  }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  failures++;
  const delay = Math.min(5 * 60_000, 5000 * 2 ** (failures - 1));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow();
  }, delay);
}

/** Push + pull now (coalesces concurrent calls). */
export function syncNow(opts: { full?: boolean } = {}): Promise<void> {
  if (!state.isOnline) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce(opts);
    } while (again && state.isOnline);
  })().finally(() => {
    running = null;
  });
  return running;
}

// ── Failed-op management (Sync screen) ──────────────────────────────────────

export function retryFailed() {
  db.runSync("UPDATE outbox SET status = 'pending', last_error = NULL WHERE status = 'failed'");
  refreshCounts();
  void syncNow();
}

/** Drop failed local changes and restore the server's version of those records. */
export function discardFailed() {
  db.runSync("DELETE FROM outbox WHERE status = 'failed'");
  refreshCounts();
  notifyDataChanged();
  void syncNow({ full: true });
}

export function resetSyncState() {
  failures = 0;
  setState({ signedOut: false, lastError: null, lastSyncAt: null, pending: 0, failed: 0 });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

let started = false;

export function startSyncEngine() {
  if (started) return;
  started = true;
  setState({ lastSyncAt: getMeta("lastSyncAt") });
  refreshCounts();

  let debounce: ReturnType<typeof setTimeout> | null = null;
  onLocalWrite(() => {
    refreshCounts();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  });
  subscribeData(refreshCounts);

  NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    const cameOnline = online && !state.isOnline;
    if (online !== state.isOnline) setState({ isOnline: online });
    if (cameOnline) {
      failures = 0;
      void syncNow();
    }
  });

  let interval: ReturnType<typeof setInterval> | null = null;
  const onAppState = (s: AppStateStatus) => {
    if (s === "active") {
      void syncNow();
      if (!interval) interval = setInterval(() => void syncNow(), 60_000);
    } else if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };
  AppState.addEventListener("change", onAppState);
  onAppState(AppState.currentState);
}
