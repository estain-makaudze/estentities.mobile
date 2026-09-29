/** Import script test: fake Supabase schema in one PGlite, target schema in another. */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { migrate } from "../scripts/migrate";

test("imports Supabase data preserving ids, invite codes and splits", async () => {
  const base = 57000 + Math.floor(Math.random() * 1000);
  const srcDb = await PGlite.create();
  const dstDb = await PGlite.create();
  const s1 = new PGLiteSocketServer({ db: srcDb, port: base, host: "127.0.0.1" });
  const s2 = new PGLiteSocketServer({ db: dstDb, port: base + 1, host: "127.0.0.1" });
  await s1.start();
  await s2.start();
  const srcUrl = `postgres://postgres@127.0.0.1:${base}/postgres`;
  const dstUrl = `postgres://postgres@127.0.0.1:${base + 1}/postgres`;
  try {
    await srcDb.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE TABLE profiles (id uuid PRIMARY KEY, name text, color text);
      CREATE TABLE households (id uuid PRIMARY KEY, name text, invite_code text, created_at timestamptz DEFAULT now());
      CREATE TABLE household_members (household_id uuid, user_id uuid, joined_at timestamptz);
      CREATE TABLE expenses (id uuid PRIMARY KEY, household_id uuid, paid_by uuid, amount numeric(12,2),
        description text, date date, category text, note text, split_ratio jsonb, created_at timestamptz DEFAULT now());
      CREATE TABLE settlements (id uuid PRIMARY KEY, household_id uuid, from_user_id uuid, to_user_id uuid,
        amount numeric(12,2), date date, note text, created_at timestamptz DEFAULT now());
      INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111','a@x.com'),
                                    ('22222222-2222-4222-8222-222222222222','b@x.com');
      INSERT INTO profiles VALUES ('11111111-1111-4111-8111-111111111111','Ann','#123456'),
                                  ('22222222-2222-4222-8222-222222222222','Ben','#654321');
      INSERT INTO households VALUES ('33333333-3333-4333-8333-333333333333','Home','ABCDEFGH', now());
      INSERT INTO household_members VALUES
        ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','2025-01-01'),
        ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','2025-02-01');
      INSERT INTO expenses VALUES ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111', 99.99, 'Shoprite', '2025-03-31', 'Groceries', null,
        '[{"userId":"11111111-1111-4111-8111-111111111111","percentage":50},{"userId":"22222222-2222-4222-8222-222222222222","percentage":50}]', now()),
        ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222', 20, 'Vet', '2025-04-01', 'Pets', 'dog', null, now());
      INSERT INTO settlements VALUES ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111', 49.99, '2025-04-02', null, now());
    `);
    await migrate(dstUrl, () => {});
    const dir = mkdtempSync(join(tmpdir(), "imp-"));
    const csv = join(dir, "phones.csv");
    writeFileSync(csv, "email,phone\na@x.com,0771111111\n");
    const env = { ...process.env, SUPABASE_DB_URL: srcUrl, DATABASE_URL: dstUrl, SUPABASE_SSL: "disable" };
    // async: the PGlite servers live in this process and must keep serving
    await promisify(execFile)("npx", ["tsx", "scripts/import-supabase.ts", "--phones", csv], { env });

    const dst = postgres(dstUrl, { max: 1 });
    const users = await dst`SELECT id, phone FROM users ORDER BY name`;
    assert.deepEqual(users.map((u) => u.phone), ["+263771111111", null]);
    const [h] = await dst`SELECT invite_code, owner_id FROM households`;
    assert.equal(h.invite_code, "ABCDEFGH");
    assert.equal(h.owner_id, "11111111-1111-4111-8111-111111111111");
    const exp = await dst`SELECT e.date::text AS d, e.amount::float AS a, e.splits, c.name AS cat
                          FROM expenses e JOIN categories c ON c.id = e.category_id ORDER BY e.date`;
    assert.equal(exp[0].d, "2025-03-31");
    assert.equal(exp[0].a, 99.99);
    assert.equal(exp[0].cat, "Groceries");
    assert.equal(exp[0].splits.length, 2);
    assert.equal(exp[1].cat, "Pets");
    const [{ n }] = await dst`SELECT count(*)::int AS n FROM categories`;
    assert.equal(n, 9); // 8 defaults + "Pets"
    await dst.end();
  } finally {
    await s1.stop();
    await s2.stop();
    await srcDb.close();
    await dstDb.close();
  }
});
