import { useSyncExternalStore } from "react";

/**
 * Tiny change bus: every local write and every applied pull bumps the version,
 * and hooks built on `useDataVersion()` re-run their SQLite queries.
 */
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeData(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribeData, () => version, () => version);
}
