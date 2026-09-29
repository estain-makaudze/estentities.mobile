import { useSyncExternalStore } from "react";
import { getSyncState, subscribeSync, type SyncState } from "../services/syncEngine";

/** Live sync status: online, syncing, pending/failed counts, last sync time. */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}
