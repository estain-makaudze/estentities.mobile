/**
 * End-to-end API test against an in-memory Postgres (PGlite over the wire protocol).
 * Run: npm test
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

const PORT = 55432 + Math.floor(Math.random() * 1000);
let db: PGlite;
let server: PGLiteSocketServer;
let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
let closeSql: () => Promise<void>;

before(async () => {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  const url = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.DATABASE_URL = url;
  process.env.DB_POOL_MAX = "1";
  process.env.NODE_ENV = "test";
  const { migrate } = await import("../scripts/migrate");
  await migrate(url, () => {});
  ({ app } = await import("../src/app"));
  const { sql } = await import("../src/db");
  closeSql = () => sql.end();
});

after(async () => {
  await closeSql?.();
  await server?.stop();
  await db?.close();
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const now = () => new Date().toISOString();

describe("family-api", () => {
  let aliceToken = "";
  let bobToken = "";
  let aliceId = "";
  let bobId = "";
  let householdId = "";
  let inviteCode = "";

  it("logs in a new phone and normalises local numbers", async () => {
    const r = await call("POST", "/auth/login", { phone: "077 123 4567", name: "Alice" });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.phone, "+263771234567");
    aliceToken = r.json.token;
    aliceId = r.json.user.id;
  });

  it("rejects requests without a token", async () => {
    const r = await call("GET", "/sync/pull");
    assert.equal(r.status, 401);
  });

  it("creates a family with default categories", async () => {
    const r = await call("POST", "/households", { name: "Makaudze", currency: "usd" }, aliceToken);
    assert.equal(r.status, 201);
    assert.equal(r.json.household.currency, "USD");
    assert.match(r.json.household.invite_code, /^[A-Z2-9]{8}$/);
    householdId = r.json.household.id;
    inviteCode = r.json.household.invite_code;
    const pull = await call("GET", "/sync/pull?since=0", undefined, aliceToken);
    assert.equal(pull.json.changes.categories.length, 8);
  });

  it("requires the invite code when an existing phone logs in on a new device", async () => {
    const noCode = await call("POST", "/auth/login", { phone: "+263771234567", name: "Mallory" });
    assert.equal(noCode.status, 409);
    assert.equal(noCode.json.error.code, "INVITE_REQUIRED");
    const bad = await call("POST", "/auth/login", { phone: "+263771234567", name: "x", inviteCode: "WRONG123" });
    assert.equal(bad.status, 403);
    const ok = await call("POST", "/auth/login", {
      phone: "0771234567", name: "Alice", inviteCode: inviteCode.toLowerCase(),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.id, aliceId);
  });

  it("lets a second member join with the code", async () => {
    const login = await call("POST", "/auth/login", { phone: "+263 78 000 0001", name: "Bob" });
    bobToken = login.json.token;
    bobId = login.json.user.id;
    const join = await call("POST", "/households/join", { code: inviteCode }, bobToken);
    assert.equal(join.status, 200);
    assert.equal(join.json.household.id, householdId);
    const pull = await call("GET", "/sync/pull?since=0", undefined, bobToken);
    assert.equal(pull.json.users.length, 2);
    assert.equal(pull.json.members.length, 2);
  });

  it("applies pushed ops idempotently and syncs them to other members", async () => {
    const before = await call("GET", "/sync/pull?since=0", undefined, bobToken);
    const cursor = before.json.cursor;
    const expenseId = randomUUID();
    const op = {
      opId: `op_${randomUUID()}`,
      entity: "expenses",
      id: expenseId,
      householdId,
      clientUpdatedAt: now(),
      data: {
        paidBy: aliceId, amount: 120.5, date: "2026-09-01", description: "Groceries",
        categoryId: null, splits: [{ userId: aliceId, percentage: 50 }, { userId: bobId, percentage: 50 }],
      },
    };
    const first = await call("POST", "/sync/push", { ops: [op] }, aliceToken);
    assert.equal(first.json.results[0].status, "applied");
    const again = await call("POST", "/sync/push", { ops: [op] }, aliceToken);
    assert.equal(again.json.results[0].status, "duplicate");

    const pull = await call("GET", `/sync/pull?since=${cursor}`, undefined, bobToken);
    assert.equal(pull.json.changes.expenses.length, 1);
    const e = pull.json.changes.expenses[0];
    assert.equal(e.id, expenseId);
    assert.equal(e.amount, 120.5);
    assert.equal(e.date, "2026-09-01");
    assert.deepEqual(e.splits[1], { userId: bobId, percentage: 50 });
    assert.equal(e.createdBy, aliceId);
    assert.ok(pull.json.cursor > cursor);

    const empty = await call("GET", `/sync/pull?since=${pull.json.cursor}`, undefined, bobToken);
    assert.equal(empty.json.changes.expenses.length, 0);
  });

  it("resolves conflicts last-write-wins and lets deletes win", async () => {
    const id = randomUUID();
    const base = { paidBy: bobId, amount: 10, date: "2026-09-02", description: "Bread", splits: null };
    const mk = (desc: string, ts: string) => ({
      opId: `op_${randomUUID()}`, entity: "expenses", id, householdId, clientUpdatedAt: ts,
      data: { ...base, description: desc },
    });
    await call("POST", "/sync/push", { ops: [mk("v2 newer", "2026-09-02T10:00:00Z")] }, bobToken);
    const stale = await call("POST", "/sync/push", { ops: [mk("v1 older", "2026-09-02T09:00:00Z")] }, aliceToken);
    assert.equal(stale.json.results[0].status, "stale");

    const del = await call("POST", "/sync/push", {
      ops: [{ opId: `op_${randomUUID()}`, entity: "expenses", id, householdId, deleted: true, clientUpdatedAt: "2026-09-02T11:00:00Z" }],
    }, aliceToken);
    assert.equal(del.json.results[0].status, "applied");
    const late = await call("POST", "/sync/push", { ops: [mk("edit after delete", "2026-09-02T12:00:00Z")] }, bobToken);
    assert.equal(late.json.results[0].status, "stale");

    const pull = await call("GET", "/sync/pull?since=0", undefined, bobToken);
    const row = pull.json.changes.expenses.find((x: any) => x.id === id);
    assert.ok(row.deletedAt);
    assert.equal(row.description, "v2 newer");
  });

  it("rejects invalid ops and ops for other households without failing the batch", async () => {
    const ok = {
      opId: `op_${randomUUID()}`, entity: "settlements", id: randomUUID(), householdId, clientUpdatedAt: now(),
      data: { fromUserId: bobId, toUserId: aliceId, amount: 30, date: "2026-09-03" },
    };
    const bad = { ...ok, opId: `op_${randomUUID()}`, id: randomUUID(), data: { ...ok.data, amount: -5 } };
    const foreign = { ...ok, opId: `op_${randomUUID()}`, id: randomUUID(), householdId: randomUUID() };
    const r = await call("POST", "/sync/push", { ops: [bad, ok, foreign] }, bobToken);
    assert.deepEqual(r.json.results.map((x: any) => x.status), ["rejected", "applied", "rejected"]);
  });

  it("collapses budgets created offline on two devices via deterministic ids", async () => {
    const id = randomUUID(); // client derives uuidv5(household+category) — same on both devices
    const mk = (amount: number, ts: string) => ({
      opId: `op_${randomUUID()}`, entity: "budgets", id, householdId, clientUpdatedAt: ts,
      data: { categoryId: null, amount },
    });
    await call("POST", "/sync/push", { ops: [mk(500, "2026-09-05T08:00:00Z")] }, aliceToken);
    await call("POST", "/sync/push", { ops: [mk(650, "2026-09-05T09:00:00Z")] }, bobToken);
    const pull = await call("GET", "/sync/pull?since=0", undefined, aliceToken);
    const budgets = pull.json.changes.budgets;
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].amount, 650);
  });

  it("hands ownership over when the owner leaves and hides data from ex-members", async () => {
    const leave = await call("POST", `/households/${householdId}/leave`, {}, aliceToken);
    assert.equal(leave.status, 200);
    const alicePull = await call("GET", "/sync/pull?since=0", undefined, aliceToken);
    assert.equal(alicePull.json.households.length, 0);
    assert.equal(alicePull.json.changes.expenses.length, 0);
    const bobPull = await call("GET", "/sync/pull?since=0", undefined, bobToken);
    assert.equal(bobPull.json.households[0].ownerId, bobId);
    const rotate = await call("POST", `/households/${householdId}/rotate-code`, {}, bobToken);
    assert.notEqual(rotate.json.household.invite_code, inviteCode);
  });

  it("revokes a device on logout", async () => {
    await call("POST", "/auth/logout", {}, bobToken);
    const r = await call("GET", "/me", undefined, bobToken);
    assert.equal(r.status, 401);
  });
});
