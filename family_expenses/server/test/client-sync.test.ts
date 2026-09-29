/**
 * Two simulated phones running the app's real data layer (db/repo, sync engine,
 * recurring generator) against the real API + in-memory Postgres.
 *
 * Native modules are swapped for Node stand-ins via test/tsconfig.client.json:
 *   npm run test:client
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { serve, type ServerType } from "@hono/node-server";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

const PG_PORT = 58000 + Math.floor(Math.random() * 1000);
const API_PORT = PG_PORT + 1000;

let pg: PGlite;
let pgServer: PGLiteSocketServer;
let http: ServerType;
let closeSql: () => Promise<void>;

// Mobile modules (loaded after env is set)
let M: {
  useDevice: (n: string) => void;
  initDatabase: () => void;
  setMeta: (k: string, v: string | null) => void;
  getMeta: (k: string) => string | null;
  db: { getAllSync: <T>(sql: string, ...a: unknown[]) => T[] };
  save: (items: any[], label: string) => void;
  remove: (e: string, id: string, label: string) => void;
  listAll: <T>(e: string, hh: string) => T[];
  api: <T>(m: string, p: string, b?: unknown) => Promise<T>;
  saveToken: (t: string | null) => Promise<void>;
  syncNow: (o?: { full?: boolean }) => Promise<void>;
  getSyncState: () => { pending: number; failed: number; lastError: string | null };
  discardFailed: () => void;
  generateDueRecurring: (hh: string, user: string) => number;
  stableId: (...p: string[]) => string;
  addPeriod: (d: string, u: "day" | "week" | "month" | "year", n: number) => string;
  today: () => string;
};

const phones: Record<string, { token: string; userId: string }> = {};
let hh = "";

async function on(name: string) {
  M.useDevice(name);
  M.initDatabase();
  await M.saveToken(phones[name]?.token ?? null);
}

async function login(name: string, phone: string) {
  await on(name);
  const r = await M.api<{ token: string; user: { id: string } }>("POST", "/auth/login", { phone, name });
  phones[name] = { token: r.token, userId: r.user.id };
  await M.saveToken(r.token);
  M.setMeta("userId", r.user.id);
}

const outbox = () => M.db.getAllSync<{ status: string }>("SELECT status FROM outbox");
const expenses = () => M.listAll<{ id: string; description: string; amount: number }>("expenses", hh);

function expense(desc: string, amount: number, paidBy: string, extra: object = {}) {
  return {
    id: randomUUID(), householdId: hh, description: desc, amount, date: M.today(), paidBy,
    categoryId: null, splits: null, note: null, recurringId: null, createdBy: paidBy, ...extra,
  };
}

before(async () => {
  pg = await PGlite.create();
  pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: "127.0.0.1" });
  await pgServer.start();
  const url = `postgres://postgres@127.0.0.1:${PG_PORT}/postgres`;
  Object.assign(process.env, {
    DATABASE_URL: url, DB_POOL_MAX: "1", NODE_ENV: "test", EXPO_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}`,
  });
  const { migrate } = await import("../scripts/migrate");
  await migrate(url, () => {});
  const { app } = await import("../src/app");
  const { sql } = await import("../src/db");
  closeSql = () => sql.end();
  http = serve({ fetch: app.fetch, port: API_PORT, hostname: "127.0.0.1" });

  // Import via the aliased specifier so we share the instance db/database.ts uses.
  const mocks = (await import("expo-sqlite" as string)) as typeof import("./client-mocks/expo-sqlite");
  const database = await import("../../db/database");
  const repo = await import("../../db/repo");
  const api = await import("../../services/api");
  const engine = await import("../../services/syncEngine");
  const recurring = await import("../../utils/recurring");
  const ids = await import("../../utils/ids");
  const dates = await import("../../utils/dates");
  M = {
    useDevice: mocks.useDevice, initDatabase: database.initDatabase, setMeta: database.setMeta,
    getMeta: database.getMeta, db: database.db as never, save: repo.save as never, remove: repo.remove as never,
    listAll: repo.listAll as never, api: api.api as never, saveToken: api.saveToken, syncNow: engine.syncNow,
    getSyncState: engine.getSyncState, discardFailed: engine.discardFailed,
    generateDueRecurring: recurring.generateDueRecurring, stableId: ids.stableId, addPeriod: dates.addPeriod,
    today: dates.today,
  };
});

after(async () => {
  http?.close();
  await closeSql?.();
  await pgServer?.stop();
  await pg?.close();
});

describe("offline-first client sync (two phones)", () => {
  it("sets up a family on phone A and joins it from phone B", async () => {
    await login("A", "0771000001");
    const { household } = await M.api<{ household: { id: string; invite_code: string } }>(
      "POST", "/households", { name: "Test family", currency: "USD" });
    hh = household.id;
    M.setMeta("householdId", hh);
    await M.syncNow({ full: true });
    assert.equal(M.listAll("categories", hh).length, 8);

    await login("B", "0771000002");
    await M.api("POST", "/households/join", { code: household.invite_code });
    M.setMeta("householdId", hh);
    await M.syncNow({ full: true });
    assert.equal(M.listAll("categories", hh).length, 8);
    assert.equal(M.db.getAllSync("SELECT * FROM members").length, 2);
  });

  it("keeps each phone's database separate", async () => {
    await on("A");
    M.setMeta("probe", "A");
    await on("B");
    assert.equal(M.getMeta("probe"), null);
    await on("A");
    assert.equal(M.getMeta("probe"), "A");
    M.setMeta("probe", null);
  });

  it("queues offline edits (coalesced) and syncs both phones", async () => {
    await on("A");
    const e1 = expense("Groceries", 100, phones.A.userId);
    M.save([["expenses", e1]], "add");
    M.save([["expenses", { ...e1, amount: 110 }]], "edit");
    M.save([["expenses", { ...e1, amount: 120 }]], "edit");
    assert.equal(outbox().length, 1, "edits to one record coalesce into one op");

    await on("B");
    M.save([["expenses", expense("Fuel", 40, phones.B.userId)]], "add");

    await on("A");
    await M.syncNow();
    assert.equal(outbox().length, 0);
    await on("B");
    await M.syncNow();
    await on("A");
    await M.syncNow();

    for (const p of ["A", "B"]) {
      await on(p);
      const list = expenses().sort((a, b) => a.description.localeCompare(b.description));
      assert.deepEqual(list.map((e) => [e.description, e.amount]), [["Fuel", 40], ["Groceries", 120]], `phone ${p}`);
    }
  });

  it("resolves concurrent offline edits last-write-wins, and deletes propagate", async () => {
    await on("A");
    const g = expenses().find((e) => e.description === "Groceries")!;
    M.save([["expenses", { ...g, householdId: hh, paidBy: phones.A.userId, date: M.today(), description: "Groceries (A)" }]], "edit");
    await new Promise((r) => setTimeout(r, 5));
    await on("B");
    M.save([["expenses", { ...g, householdId: hh, paidBy: phones.A.userId, date: M.today(), description: "Groceries (B)" }]], "edit");
    const fuel = expenses().find((e) => e.description === "Fuel")!;
    M.remove("expenses", fuel.id, "delete");

    await on("A"); await M.syncNow();
    await on("B"); await M.syncNow();
    await on("A"); await M.syncNow();

    for (const p of ["A", "B"]) {
      await on(p);
      assert.deepEqual(expenses().map((e) => e.description), ["Groceries (B)"], `phone ${p}`);
    }
  });

  it("merges the same budget set offline on both phones (deterministic id)", async () => {
    const id = M.stableId("budget", hh, "total");
    await on("B");
    M.save([["budgets", { id, householdId: hh, categoryId: null, amount: 500 }]], "budget");
    await new Promise((r) => setTimeout(r, 5));
    await on("A");
    M.save([["budgets", { id, householdId: hh, categoryId: null, amount: 600 }]], "budget");
    await on("B"); await M.syncNow();
    await on("A"); await M.syncNow();
    await on("B"); await M.syncNow();
    for (const p of ["A", "B"]) {
      await on(p);
      const budgets = M.listAll<{ amount: number }>("budgets", hh);
      assert.deepEqual(budgets.map((b) => b.amount), [600], `phone ${p}`);
    }
  });

  it("generates recurring expenses once even when both phones do it offline", async () => {
    await on("A");
    const start = M.addPeriod(M.today(), "month", -2);
    const rec = {
      id: randomUUID(), householdId: hh, description: "Rent", amount: 300, categoryId: null,
      paidBy: phones.A.userId, splits: null, note: null, frequency: "month", intervalN: 1,
      startDate: start, nextDue: start, active: true,
    };
    M.save([["recurring", rec]], "recurring");
    await M.syncNow();
    await on("B");
    await M.syncNow(); // B learns about the template…

    // …then both phones generate the due occurrences while offline.
    assert.equal(M.generateDueRecurring(hh, phones.B.userId), 3);
    await on("A");
    assert.equal(M.generateDueRecurring(hh, phones.A.userId), 3);

    await on("A"); await M.syncNow();
    await on("B"); await M.syncNow();
    await on("A"); await M.syncNow();
    for (const p of ["A", "B"]) {
      await on(p);
      const rent = expenses().filter((e) => e.description === "Rent");
      assert.equal(rent.length, 3, `phone ${p} has exactly 3 rent entries`);
      const r = M.listAll<{ nextDue: string }>("recurring", hh)[0];
      assert.equal(r.nextDue, M.addPeriod(start, "month", 3));
    }
    const [{ n }] = await (await import("../src/db")).sql`SELECT count(*)::int AS n FROM expenses WHERE description = 'Rent'`;
    assert.equal(n, 3, "server has 3 rows");
  });

  it("marks server-rejected changes as failed without blocking others, and discard restores server state", async () => {
    await on("A");
    const bad = expense("Ghost payer", 10, randomUUID()); // paidBy is not a real user → FK violation
    const good = expense("Bread", 5, phones.A.userId);
    M.save([["expenses", bad]], "bad");
    M.save([["expenses", good]], "good");
    await M.syncNow();
    assert.deepEqual(outbox().map((o) => o.status), ["failed"]);
    assert.equal(M.getSyncState().failed, 1);
    assert.ok(expenses().some((e) => e.description === "Bread"));

    M.discardFailed();
    await M.syncNow({ full: true });
    assert.equal(outbox().length, 0);
    assert.ok(!expenses().some((e) => e.description === "Ghost payer"), "discarded row removed locally");
    assert.ok(expenses().some((e) => e.description === "Bread"));
  });
});
