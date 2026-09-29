import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVars } from "../auth";
import { lockRevs, sql, type Tx } from "../db";
import { DEFAULT_CATEGORIES, fail, makeInviteCode } from "../util";

export const households = new Hono<AuthVars>();
households.use("*", requireAuth);

const Currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

async function uniqueInviteCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = makeInviteCode();
    const [hit] = await tx`SELECT 1 FROM households WHERE invite_code = ${code}`;
    if (!hit) return code;
  }
  throw new Error("Could not allocate invite code");
}

async function requireRole(tx: Tx, householdId: string, userId: string, owner = false) {
  const [m] = await tx<{ role: string }[]>`
    SELECT m.role FROM household_members m
    JOIN households h ON h.id = m.household_id AND h.deleted_at IS NULL
    WHERE m.household_id = ${householdId} AND m.user_id = ${userId} AND m.deleted_at IS NULL`;
  if (!m) throw fail(404, "NOT_FOUND", "Family not found.");
  if (owner && m.role !== "owner") throw fail(403, "OWNER_ONLY", "Only the family owner can do this.");
}

const householdCols = sql`id, name, invite_code, currency, owner_id, created_at`;

households.post("/", async (c) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(60), currency: Currency.default("USD") })
    .parse(await c.req.json());
  const userId = c.get("userId");

  const household = await sql.begin(async (tx) => {
    await lockRevs(tx);
    const code = await uniqueInviteCode(tx);
    const [h] = await tx`
      INSERT INTO households (name, invite_code, currency, owner_id)
      VALUES (${body.name}, ${code}, ${body.currency}, ${userId})
      RETURNING ${householdCols}`;
    await tx`INSERT INTO household_members (household_id, user_id, role)
             VALUES (${h.id}, ${userId}, 'owner')`;
    const cats = DEFAULT_CATEGORIES.map((cat, i) => ({
      id: crypto.randomUUID(),
      household_id: h.id,
      name: cat.name,
      emoji: cat.emoji,
      color: cat.color,
      sort_order: i,
    }));
    await tx`INSERT INTO categories ${tx(cats)}`;
    return h;
  });
  return c.json({ household }, 201);
});

households.post("/join", async (c) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(16) }).parse(await c.req.json());
  const userId = c.get("userId");
  const household = await sql.begin(async (tx) => {
    await lockRevs(tx);
    const [h] = await tx`
      SELECT ${householdCols} FROM households
      WHERE invite_code = ${code.toUpperCase().replace(/\s/g, "")} AND deleted_at IS NULL`;
    if (!h) throw fail(404, "INVITE_INVALID", "No family found with that code.");
    await tx`
      INSERT INTO household_members (household_id, user_id, role)
      VALUES (${h.id}, ${userId}, 'member')
      ON CONFLICT (household_id, user_id)
      DO UPDATE SET deleted_at = NULL, joined_at = now()
      WHERE household_members.deleted_at IS NOT NULL`;
    return h;
  });
  return c.json({ household });
});

households.patch("/:id", async (c) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(60).optional(), currency: Currency.optional() })
    .parse(await c.req.json());
  const id = c.req.param("id");
  const household = await sql.begin(async (tx) => {
    await requireRole(tx, id, c.get("userId"), true);
    await lockRevs(tx);
    const [h] = await tx`
      UPDATE households SET name = coalesce(${body.name ?? null}, name),
                            currency = coalesce(${body.currency ?? null}, currency)
      WHERE id = ${id} RETURNING ${householdCols}`;
    return h;
  });
  return c.json({ household });
});

households.post("/:id/rotate-code", async (c) => {
  const id = c.req.param("id");
  const household = await sql.begin(async (tx) => {
    await requireRole(tx, id, c.get("userId"), true);
    await lockRevs(tx);
    const code = await uniqueInviteCode(tx);
    const [h] = await tx`UPDATE households SET invite_code = ${code} WHERE id = ${id}
                         RETURNING ${householdCols}`;
    return h;
  });
  return c.json({ household });
});

/** Leave a family. Ownership passes to the longest-standing member; empty families are archived. */
async function removeMember(tx: Tx, householdId: string, userId: string) {
  const [m] = await tx<{ role: string }[]>`
    SELECT role FROM household_members
    WHERE household_id = ${householdId} AND user_id = ${userId} AND deleted_at IS NULL`;
  if (!m) return;
  await tx`UPDATE household_members SET deleted_at = now(), role = 'member'
           WHERE household_id = ${householdId} AND user_id = ${userId}`;
  const [next] = await tx<{ user_id: string }[]>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND deleted_at IS NULL
    ORDER BY (role = 'owner') DESC, joined_at ASC LIMIT 1`;
  if (!next) {
    await tx`UPDATE households SET deleted_at = now() WHERE id = ${householdId}`;
  } else if (m.role === "owner") {
    await tx`UPDATE household_members SET role = 'owner'
             WHERE household_id = ${householdId} AND user_id = ${next.user_id}`;
    await tx`UPDATE households SET owner_id = ${next.user_id} WHERE id = ${householdId}`;
  }
}

households.post("/:id/leave", async (c) => {
  const id = c.req.param("id");
  await sql.begin(async (tx) => {
    await requireRole(tx, id, c.get("userId"));
    await lockRevs(tx);
    await removeMember(tx, id, c.get("userId"));
  });
  return c.json({ ok: true });
});

households.delete("/:id/members/:userId", async (c) => {
  const id = c.req.param("id");
  const target = c.req.param("userId");
  if (target === c.get("userId")) throw fail(400, "USE_LEAVE", "Use leave to remove yourself.");
  await sql.begin(async (tx) => {
    await requireRole(tx, id, c.get("userId"), true);
    await lockRevs(tx);
    await removeMember(tx, id, target);
  });
  return c.json({ ok: true });
});
