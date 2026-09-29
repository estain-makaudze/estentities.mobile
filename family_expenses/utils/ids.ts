import * as Crypto from "expo-crypto";
import { v5 as uuidv5 } from "uuid";

/** Random id for new records (UUID v4). */
export function newId(): string {
  return Crypto.randomUUID();
}

/** Namespace for deterministic ids — never change it. */
const NS = "5b1d9f3e-8c2a-4f6e-9a7b-2d4c6e8f0a13";

/**
 * Deterministic id: two devices that create "the same" thing offline (a monthly
 * budget, a recurring instance) produce the same UUID, so the server merges them.
 */
export function stableId(...parts: string[]): string {
  return uuidv5(parts.join("|"), NS);
}

export function newOpId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
