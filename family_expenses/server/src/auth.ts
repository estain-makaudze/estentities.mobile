import type { Context, MiddlewareHandler } from "hono";
import { sql } from "./db";
import { fail, hashToken } from "./util";

export type AuthVars = { Variables: { userId: string; deviceId: string } };

/** Bearer device-token auth. Tokens never expire (offline-first) but can be revoked. */
export const requireAuth: MiddlewareHandler<AuthVars> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw fail(401, "UNAUTHENTICATED", "Missing token.");
  const [device] = await sql<{ id: string; user_id: string; last_seen: Date }[]>`
    SELECT id, user_id, last_seen FROM devices
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
  if (!device) throw fail(401, "UNAUTHENTICATED", "This device has been signed out.");
  if (Date.now() - device.last_seen.getTime() > 60 * 60 * 1000) {
    await sql`UPDATE devices SET last_seen = now() WHERE id = ${device.id}`;
  }
  c.set("userId", device.user_id);
  c.set("deviceId", device.id);
  await next();
};

/** Active household ids for a user. */
export async function householdIdsFor(userId: string): Promise<string[]> {
  const rows = await sql<{ household_id: string }[]>`
    SELECT m.household_id FROM household_members m
    JOIN households h ON h.id = m.household_id AND h.deleted_at IS NULL
    WHERE m.user_id = ${userId} AND m.deleted_at IS NULL`;
  return rows.map((r) => r.household_id);
}

// ── Tiny in-memory rate limiter (per IP, per route group) ─────────────────
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(limit: number, windowMs: number): MiddlewareHandler {
  return async (c: Context, next) => {
    // nginx sets X-Real-IP to the real client address; X-Forwarded-For's first hop is client-controlled.
    const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",").pop()?.trim() ?? "local";
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < now) buckets.set(key, { count: 1, reset: now + windowMs });
    else if (++b.count > limit) throw fail(429, "RATE_LIMITED", "Too many attempts. Try again later.");
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    await next();
  };
}
