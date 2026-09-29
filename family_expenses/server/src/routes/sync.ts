import { Hono } from "hono";
import { z } from "zod";
import { householdIdsFor, requireAuth, type AuthVars } from "../auth";
import { lockRevs, sql } from "../db";

export const sync = new Hono<AuthVars>();
sync.use("*", requireAuth);

// ── Entity registry ──────────────────────────────────────────────────────────
// Client-facing names/fields are camelCase; DB columns are snake_case.

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite().positive().max(9_999_999_999);
const Splits = z
  .array(z.object({ userId: uuid, percentage: z.number().min(0).max(100) }))
  .nullable()
  .refine(
    (s) => s === null || s.length === 0 || Math.abs(s.reduce((a, x) => a + x.percentage, 0) - 100) < 0.5,
    "Split percentages must add up to 100",
  );

type Entity = {
  table: string;
  /** camelCase field → snake_case column (excluding id/household_id/meta) */
  fields: Record<string, string>;
  json: string[];
  schema: z.ZodTypeAny;
  /** set created_by on insert only */
  createdBy?: boolean;
};

const ENTITIES: Record<string, Entity> = {
  categories: {
    table: "categories",
    fields: { name: "name", emoji: "emoji", color: "color", defaultSplits: "default_splits", sortOrder: "sort_order" },
    json: ["default_splits"],
    schema: z.object({
      name: z.string().trim().min(1).max(40),
      emoji: z.string().min(1).max(16),
      color: z.string().max(16).nullable().optional(),
      defaultSplits: Splits.optional(),
      sortOrder: z.number().int().optional(),
    }),
  },
  expenses: {
    table: "expenses",
    fields: {
      paidBy: "paid_by", amount: "amount", date: "date", description: "description",
      categoryId: "category_id", note: "note", splits: "splits", recurringId: "recurring_id",
    },
    json: ["splits"],
    createdBy: true,
    schema: z.object({
      paidBy: uuid,
      amount: money,
      date: isoDate,
      description: z.string().trim().min(1).max(200),
      categoryId: uuid.nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
      splits: Splits.optional(),
      recurringId: uuid.nullable().optional(),
    }),
  },
  settlements: {
    table: "settlements",
    fields: { fromUserId: "from_user_id", toUserId: "to_user_id", amount: "amount", date: "date", note: "note" },
    json: [],
    createdBy: true,
    schema: z
      .object({
        fromUserId: uuid,
        toUserId: uuid,
        amount: money,
        date: isoDate,
        note: z.string().max(1000).nullable().optional(),
      })
      .refine((s) => s.fromUserId !== s.toUserId, "Payer and receiver must differ"),
  },
  budgets: {
    table: "budgets",
    fields: { categoryId: "category_id", amount: "amount" },
    json: [],
    schema: z.object({ categoryId: uuid.nullable(), amount: z.number().finite().min(0) }),
  },
  recurring: {
    table: "recurring_expenses",
    fields: {
      description: "description", amount: "amount", categoryId: "category_id", paidBy: "paid_by",
      splits: "splits", note: "note", frequency: "frequency", intervalN: "interval_n",
      startDate: "start_date", nextDue: "next_due", active: "active",
    },
    json: ["splits"],
    schema: z.object({
      description: z.string().trim().min(1).max(200),
      amount: money,
      categoryId: uuid.nullable().optional(),
      paidBy: uuid,
      splits: Splits.optional(),
      note: z.string().max(1000).nullable().optional(),
      frequency: z.enum(["week", "month", "year"]),
      intervalN: z.number().int().min(1).max(52),
      startDate: isoDate,
      nextDue: isoDate,
      active: z.boolean(),
    }),
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES);

function toClient(ent: Entity, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    id: row.id,
    householdId: row.household_id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    clientUpdatedAt: row.client_updated_at,
    rev: Number(row.rev),
  };
  for (const [camel, col] of Object.entries(ent.fields)) out[camel] = row[col] ?? null;
  if (ent.createdBy) out.createdBy = row.created_by ?? null;
  return out;
}

// ── Push ─────────────────────────────────────────────────────────────────────

const Op = z.object({
  opId: z.string().min(8).max(80),
  entity: z.enum(ENTITY_NAMES as [string, ...string[]]),
  id: uuid,
  householdId: uuid,
  deleted: z.boolean().default(false),
  data: z.record(z.unknown()).nullable().optional(),
  clientUpdatedAt: z.string().datetime({ offset: true }),
});
const PushBody = z.object({ ops: z.array(Op).max(500) });

type OpResult = { opId: string; status: "applied" | "duplicate" | "stale" | "rejected"; error?: string };

sync.post("/push", async (c) => {
  const { ops } = PushBody.parse(await c.req.json());
  const userId = c.get("userId");
  const allowed = new Set(await householdIdsFor(userId));
  const results: OpResult[] = [];

  await sql.begin(async (tx) => {
    await lockRevs(tx);
    for (const op of ops) {
      const [dup] = await tx`SELECT 1 FROM applied_ops WHERE op_id = ${op.opId}`;
      if (dup) {
        results.push({ opId: op.opId, status: "duplicate" });
        continue;
      }
      const ent = ENTITIES[op.entity];
      try {
        const status = await tx.savepoint(async (sp) => {
          const [existing] = await sp<{ household_id: string }[]>`
            SELECT household_id FROM ${sp(ent.table)} WHERE id = ${op.id}`;
          const hh = existing?.household_id ?? op.householdId;
          if (!allowed.has(hh)) throw new Error("Not a member of this family");

          if (op.deleted) {
            const r = await sp`
              UPDATE ${sp(ent.table)}
              SET deleted_at = now(), client_updated_at = ${op.clientUpdatedAt}
              WHERE id = ${op.id} AND deleted_at IS NULL`;
            await sp`INSERT INTO applied_ops (op_id, user_id) VALUES (${op.opId}, ${userId})`;
            return r.count > 0 || !existing ? "applied" : "stale";
          }

          const data = ent.schema.parse(op.data ?? {}) as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row: Record<string, any> = {
            id: op.id,
            household_id: hh,
            client_updated_at: op.clientUpdatedAt,
          };
          for (const [camel, col] of Object.entries(ent.fields)) {
            if (!(camel in data)) continue;
            const v = data[camel] ?? null;
            row[col] = ent.json.includes(col) && v !== null ? sp.json(v as never) : v;
          }
          const updateCols = Object.keys(row).filter((k) => k !== "id" && k !== "household_id");
          if (ent.createdBy) row.created_by = userId;

          // Last-write-wins on client timestamp; deletes win over later edits.
          const r = await sp`
            INSERT INTO ${sp(ent.table)} ${sp(row)}
            ON CONFLICT (id) DO UPDATE SET ${sp(row, updateCols)}
            WHERE ${sp(ent.table)}.deleted_at IS NULL
              AND ${sp(ent.table)}.client_updated_at <= ${op.clientUpdatedAt}`;
          await sp`INSERT INTO applied_ops (op_id, user_id) VALUES (${op.opId}, ${userId})`;
          return r.count > 0 ? "applied" : "stale";
        });
        results.push({ opId: op.opId, status: status as OpResult["status"] });
      } catch (e) {
        const msg =
          e instanceof z.ZodError
            ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : e instanceof Error
              ? e.message
              : String(e);
        results.push({ opId: op.opId, status: "rejected", error: msg });
      }
    }
  });

  return c.json({ results });
});

// ── Pull ─────────────────────────────────────────────────────────────────────

sync.get("/pull", async (c) => {
  const since = Math.max(0, Number(c.req.query("since") ?? 0) || 0);
  const userId = c.get("userId");

  // Take the writer lock briefly: once held, every rev <= last_value is committed.
  const cursor = await sql.begin(async (tx) => {
    await lockRevs(tx);
    const [{ v }] = await tx<{ v: string }[]>`
      SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS v FROM rev_seq`;
    return Number(v);
  });

  const hhIds = await householdIdsFor(userId);

  const householdRows = hhIds.length
    ? await sql`SELECT id, name, invite_code, currency, owner_id, created_at
                FROM households WHERE id IN ${sql(hhIds)}`
    : [];
  const memberRows = hhIds.length
    ? await sql`SELECT household_id, user_id, role, joined_at, deleted_at
                FROM household_members WHERE household_id IN ${sql(hhIds)}`
    : [];
  const userIds = [...new Set([userId, ...memberRows.map((m) => m.user_id as string)])];
  const users = await sql`SELECT id, name, color, phone FROM users WHERE id IN ${sql(userIds)}`;

  const changes: Record<string, unknown[]> = {};
  for (const [name, ent] of Object.entries(ENTITIES)) {
    changes[name] = hhIds.length
      ? (
          await sql`SELECT * FROM ${sql(ent.table)}
                    WHERE household_id IN ${sql(hhIds)} AND rev > ${since} AND rev <= ${cursor}
                    ORDER BY rev`
        ).map((r) => toClient(ent, r))
      : [];
  }

  return c.json({
    cursor,
    households: householdRows.map((h) => ({
      id: h.id, name: h.name, inviteCode: h.invite_code, currency: h.currency,
      ownerId: h.owner_id, createdAt: h.created_at,
    })),
    members: memberRows.map((m) => ({
      householdId: m.household_id, userId: m.user_id, role: m.role,
      joinedAt: m.joined_at, leftAt: m.deleted_at,
    })),
    users,
    changes,
  });
});
