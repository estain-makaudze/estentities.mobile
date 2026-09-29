import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, rateLimit, type AuthVars } from "../auth";
import { lockRevs, sql } from "../db";
import { USER_COLORS, fail, hashToken, makeToken, normalizePhone } from "../util";

export const account = new Hono<AuthVars>();

const LoginBody = z.object({
  phone: z.string().min(6).max(24),
  name: z.string().trim().min(1).max(60),
  deviceName: z.string().trim().max(60).optional(),
  inviteCode: z.string().trim().max(16).optional(),
});

/**
 * Phone + name login (no password, no SMS — by design, kept lightweight).
 *
 * - New phone                → account created, token issued.
 * - Existing phone, no family → token issued.
 * - Existing phone in a family → must supply that family's current invite code
 *   (only members know it; the owner can rotate it). Stops someone taking over
 *   an account just by typing a known phone number.
 */
account.post("/auth/login", rateLimit(20, 10 * 60 * 1000), async (c) => {
  const body = LoginBody.parse(await c.req.json());
  const phone = normalizePhone(body.phone);

  const result = await sql.begin(async (tx) => {
    await lockRevs(tx);
    let [user] = await tx<{ id: string; name: string; color: string; phone: string }[]>`
      SELECT id, name, color, phone FROM users WHERE phone = ${phone}`;

    if (!user) {
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
      [user] = await tx<{ id: string; name: string; color: string; phone: string }[]>`
        INSERT INTO users (phone, name, color)
        VALUES (${phone}, ${body.name}, ${USER_COLORS[n % USER_COLORS.length]})
        RETURNING id, name, color, phone`;
    } else {
      const codes = await tx<{ invite_code: string }[]>`
        SELECT h.invite_code FROM household_members m
        JOIN households h ON h.id = m.household_id AND h.deleted_at IS NULL
        WHERE m.user_id = ${user.id} AND m.deleted_at IS NULL`;
      if (codes.length > 0) {
        const given = body.inviteCode?.toUpperCase().replace(/\s/g, "");
        if (!given) {
          throw fail(409, "INVITE_REQUIRED",
            "This number already belongs to a family. Enter your family's invite code to sign in on this phone.");
        }
        if (!codes.some((r) => r.invite_code === given)) {
          throw fail(403, "INVITE_INVALID", "That invite code doesn't match your family.");
        }
      }
    }

    const token = makeToken();
    await tx`INSERT INTO devices (user_id, token_hash, name)
             VALUES (${user.id}, ${hashToken(token)}, ${body.deviceName ?? "Phone"})`;
    return { token, user };
  });

  return c.json(result);
});

account.use("/me", requireAuth);
account.use("/me/*", requireAuth);
account.use("/auth/logout", requireAuth);

account.post("/auth/logout", async (c) => {
  await sql`UPDATE devices SET revoked_at = now() WHERE id = ${c.get("deviceId")}`;
  return c.json({ ok: true });
});

account.get("/me", async (c) => {
  const userId = c.get("userId");
  const [user] = await sql`SELECT id, name, color, phone FROM users WHERE id = ${userId}`;
  const devices = await sql`
    SELECT id, name, created_at, last_seen, (id = ${c.get("deviceId")}) AS current
    FROM devices WHERE user_id = ${userId} AND revoked_at IS NULL ORDER BY last_seen DESC`;
  return c.json({ user, devices });
});

const MeBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

account.patch("/me", async (c) => {
  const body = MeBody.parse(await c.req.json());
  const [user] = await sql.begin(async (tx) => {
    await lockRevs(tx);
    return tx`
      UPDATE users SET name = coalesce(${body.name ?? null}, name),
                       color = coalesce(${body.color ?? null}, color)
      WHERE id = ${c.get("userId")} RETURNING id, name, color, phone`;
  });
  return c.json({ user });
});

account.delete("/me/devices/:id", async (c) => {
  const res = await sql`
    UPDATE devices SET revoked_at = now()
    WHERE id = ${c.req.param("id")} AND user_id = ${c.get("userId")} AND revoked_at IS NULL`;
  if (res.count === 0) throw fail(404, "NOT_FOUND", "Device not found.");
  return c.json({ ok: true });
});
