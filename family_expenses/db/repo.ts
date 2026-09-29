import type {
  Budget, Category, EntityName, Expense, Household, HouseholdMember, Recurring, Settlement, User,
} from "../types";
import { newOpId } from "../utils/ids";
import { db, setMeta } from "./database";
import { notifyDataChanged } from "./events";

// ── Entity ↔ row mapping ────────────────────────────────────────────────────

type Row = Record<string, any>;

type EntityDef<T> = {
  table: string;
  /** camelCase field → column */
  fields: Record<string, string>;
  json: string[];
  bool: string[];
  sample?: T;
};

const DEFS: Record<EntityName, EntityDef<unknown>> = {
  categories: {
    table: "categories",
    fields: { name: "name", emoji: "emoji", color: "color", defaultSplits: "default_splits", sortOrder: "sort_order" },
    json: ["default_splits"],
    bool: [],
  },
  expenses: {
    table: "expenses",
    fields: {
      paidBy: "paid_by", amount: "amount", date: "date", description: "description",
      categoryId: "category_id", note: "note", splits: "splits", recurringId: "recurring_id",
    },
    json: ["splits"],
    bool: [],
  },
  settlements: {
    table: "settlements",
    fields: { fromUserId: "from_user_id", toUserId: "to_user_id", amount: "amount", date: "date", note: "note" },
    json: [],
    bool: [],
  },
  budgets: {
    table: "budgets",
    fields: { categoryId: "category_id", amount: "amount" },
    json: [],
    bool: [],
  },
  recurring: {
    table: "recurring",
    fields: {
      description: "description", amount: "amount", categoryId: "category_id", paidBy: "paid_by",
      splits: "splits", note: "note", frequency: "frequency", intervalN: "interval_n",
      startDate: "start_date", nextDue: "next_due", active: "active",
    },
    json: ["splits"],
    bool: ["active"],
  },
};

function toColumns(entity: EntityName, rec: Row): Row {
  const def = DEFS[entity];
  const row: Row = { id: rec.id, household_id: rec.householdId };
  for (const [f, col] of Object.entries(def.fields)) {
    let v = rec[f];
    if (v === undefined) v = null;
    if (def.json.includes(col)) v = v === null ? null : JSON.stringify(v);
    if (def.bool.includes(col)) v = v ? 1 : 0;
    row[col] = v;
  }
  if (entity === "expenses") row.created_by = rec.createdBy ?? null;
  return row;
}

export function fromRow<T>(entity: EntityName, row: Row): T {
  const def = DEFS[entity];
  const out: Row = { id: row.id, householdId: row.household_id };
  for (const [f, col] of Object.entries(def.fields)) {
    let v = row[col];
    if (def.json.includes(col)) v = v ? JSON.parse(v) : null;
    if (def.bool.includes(col)) v = !!v;
    out[f] = v;
  }
  if (entity === "expenses") out.createdBy = row.created_by ?? null;
  return out as T;
}

/** Payload sent to the server (camelCase data without id/householdId). */
function toPayload(entity: EntityName, rec: Row): Row {
  const data: Row = {};
  for (const f of Object.keys(DEFS[entity].fields)) data[f] = rec[f] ?? null;
  return data;
}

function upsertRow(table: string, row: Row) {
  const cols = Object.keys(row);
  db.runSync(
    `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c] ?? null)
  );
}

// ── Local writes (row + outbox op in one transaction) ───────────────────────

let afterWrite: (() => void) | null = null;
/** The sync engine registers here to push soon after local changes. */
export function onLocalWrite(fn: () => void) {
  afterWrite = fn;
}

function enqueue(entity: EntityName, id: string, householdId: string, deleted: boolean,
                 data: Row | null, ts: string, label: string) {
  // Coalesce: an older pending op for the same record is superseded by this snapshot.
  db.runSync("DELETE FROM outbox WHERE record_id = ? AND entity = ? AND status = 'pending'", id, entity);
  db.runSync(
    `INSERT INTO outbox (op_id, entity, record_id, household_id, deleted, data, client_updated_at, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newOpId(), entity, id, householdId, deleted ? 1 : 0, data ? JSON.stringify(data) : null, ts, label
  );
}

type Saveable =
  | ["categories", Category]
  | ["expenses", Expense]
  | ["settlements", Settlement]
  | ["budgets", Budget]
  | ["recurring", Recurring];

/** Create or update records locally and queue them for sync. */
export function save(items: Saveable[], label: string) {
  const ts = new Date().toISOString();
  db.withTransactionSync(() => {
    for (const [entity, rec] of items) {
      const row = toColumns(entity, rec as unknown as Row);
      row.client_updated_at = ts;
      row.deleted_at = null;
      upsertRow(DEFS[entity].table, row);
      enqueue(entity, rec.id, rec.householdId, false, toPayload(entity, rec as unknown as Row), ts, label);
    }
  });
  notifyDataChanged();
  afterWrite?.();
}

/** Soft-delete locally and queue the delete. */
export function remove(entity: EntityName, id: string, label: string) {
  const ts = new Date().toISOString();
  const table = DEFS[entity].table;
  const row = db.getFirstSync<{ household_id: string }>(`SELECT household_id FROM ${table} WHERE id = ?`, id);
  if (!row) return;
  db.withTransactionSync(() => {
    db.runSync(`UPDATE ${table} SET deleted_at = ?, client_updated_at = ? WHERE id = ?`, ts, ts, id);
    enqueue(entity, id, row.household_id, true, null, ts, label);
  });
  notifyDataChanged();
  afterWrite?.();
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function getOne<T>(entity: EntityName, id: string): T | null {
  const row = db.getFirstSync<Row>(`SELECT * FROM ${DEFS[entity].table} WHERE id = ? AND deleted_at IS NULL`, id);
  return row ? fromRow<T>(entity, row) : null;
}

export function listAll<T>(entity: EntityName, householdId: string, orderBy = "rowid"): T[] {
  return db
    .getAllSync<Row>(
      `SELECT * FROM ${DEFS[entity].table} WHERE household_id = ? AND deleted_at IS NULL ORDER BY ${orderBy}`,
      householdId
    )
    .map((r) => fromRow<T>(entity, r));
}

export function listUsers(ids?: string[]): User[] {
  const rows = db.getAllSync<User>("SELECT id, name, color, phone FROM users");
  return ids ? rows.filter((u) => ids.includes(u.id)) : rows;
}

export function listHouseholds(): Household[] {
  return db
    .getAllSync<Row>("SELECT * FROM households ORDER BY name")
    .map((h) => ({ id: h.id, name: h.name, inviteCode: h.invite_code, currency: h.currency, ownerId: h.owner_id }));
}

export function listMembers(householdId: string, includeLeft = false): HouseholdMember[] {
  return db
    .getAllSync<Row>(
      `SELECT * FROM members WHERE household_id = ? ${includeLeft ? "" : "AND left_at IS NULL"} ORDER BY joined_at`,
      householdId
    )
    .map((m) => ({
      householdId: m.household_id, userId: m.user_id, role: m.role, joinedAt: m.joined_at, leftAt: m.left_at,
    }));
}

// ── Applying server state (pull) ────────────────────────────────────────────

export type PullResponse = {
  cursor: number;
  households: Household[];
  members: HouseholdMember[];
  users: User[];
  changes: Record<EntityName, Row[]>;
};

/**
 * Apply a pull. Server rows overwrite local ones unless the record still has a
 * queued local change (that change is pushed first and wins or loses on the
 * server by last-write-wins; the next pull brings the outcome).
 */
export function applyPull(res: PullResponse, full = false) {
  db.withTransactionSync(() => {
    // Households / members / users are sent in full each pull.
    const hhIds = res.households.map((h) => h.id);
    db.runSync("DELETE FROM households");
    for (const h of res.households) {
      upsertRow("households", {
        id: h.id, name: h.name, invite_code: h.inviteCode, currency: h.currency, owner_id: h.ownerId,
      });
    }
    db.runSync("DELETE FROM members");
    for (const m of res.members) {
      upsertRow("members", {
        household_id: m.householdId, user_id: m.userId, role: m.role, joined_at: m.joinedAt, left_at: m.leftAt,
      });
    }
    for (const u of res.users) upsertRow("users", { id: u.id, name: u.name, color: u.color, phone: u.phone ?? null });

    const pending = new Set(
      db.getAllSync<{ record_id: string }>("SELECT record_id FROM outbox").map((r) => r.record_id)
    );
    for (const entity of Object.keys(DEFS) as EntityName[]) {
      const table = DEFS[entity].table;
      const incoming = res.changes[entity] ?? [];
      for (const rec of incoming) {
        if (pending.has(rec.id)) continue;
        const row = toColumns(entity, rec);
        row.client_updated_at = rec.clientUpdatedAt ?? null;
        row.deleted_at = rec.deletedAt ?? null;
        upsertRow(table, row);
      }
      if (full) {
        // A full pull is the complete server state: drop local rows the server
        // doesn't know about (e.g. a discarded change that was never accepted).
        const known = new Set(incoming.map((r) => r.id as string));
        for (const { id } of db.getAllSync<{ id: string }>(`SELECT id FROM ${table}`)) {
          if (!known.has(id) && !pending.has(id)) db.runSync(`DELETE FROM ${table} WHERE id = ?`, id);
        }
      }
    }

    // Drop data of families this user no longer belongs to.
    const keep = hhIds.length ? `household_id NOT IN (${hhIds.map(() => "?").join(",")})` : "1 = 1";
    for (const t of ["categories", "expenses", "settlements", "budgets", "recurring", "outbox"]) {
      db.runSync(`DELETE FROM ${t} WHERE ${keep}`, hhIds);
    }
    setMeta("cursor", String(res.cursor));
    setMeta("lastSyncAt", new Date().toISOString());
  });
  notifyDataChanged();
}
