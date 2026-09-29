/**
 * One-time import: Supabase (old backend) → family-api Postgres.
 *
 *   SUPABASE_DB_URL=postgresql://...  DATABASE_URL=postgres://...  \
 *     npm run import:supabase -- --phones phones.csv [--household INVITECODE] [--currency USD] [--dry-run]
 *
 * --household limits the import to one family (and its members) by invite code,
 * so test families/accounts are left behind.
 *
 * phones.csv maps each old login email to the phone number the person will use now:
 *     email,phone
 *     estain@example.com,0771234567
 *
 * - UUIDs of users, households, expenses and settlements are preserved, and so are
 *   invite codes, so members keep using the code they already know.
 * - Free-text expense categories become synced category rows (one per distinct name).
 * - A user without a phone mapping is imported with phone = NULL and cannot log in
 *   until you set it:  UPDATE users SET phone = '+263…' WHERE id = '…';
 * - Safe to re-run: every insert is ON CONFLICT DO NOTHING.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { DEFAULT_CATEGORIES, USER_COLORS, normalizePhone } from "../src/util";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const phonesPath = args[args.indexOf("--phones") + 1];
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const onlyHousehold = opt("--household")?.toUpperCase();
const currency = (opt("--currency") ?? "USD").toUpperCase();
if (!args.includes("--phones") || !phonesPath) {
  console.error("Usage: import-supabase --phones phones.csv [--dry-run]");
  process.exit(1);
}
const srcUrl = process.env.SUPABASE_DB_URL;
const dstUrl = process.env.DATABASE_URL;
if (!srcUrl || !dstUrl) throw new Error("Set SUPABASE_DB_URL and DATABASE_URL");

const phoneByEmail = new Map<string, string>();
for (const line of readFileSync(phonesPath, "utf8").split(/\r?\n/).slice(1)) {
  const [email, phone] = line.split(",").map((s) => s?.trim());
  if (email && phone) phoneByEmail.set(email.toLowerCase(), normalizePhone(phone));
}

// Read `date` columns as plain "YYYY-MM-DD" strings (not JS Dates) to avoid timezone shifts.
const dateAsString = { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x };
const src = postgres(srcUrl, {
  max: 1,
  ssl: process.env.SUPABASE_SSL === "disable" ? false : "require",
  types: { date: dateAsString },
});
const dst = postgres(dstUrl, { max: 1 });

type Row = Record<string, any>;

try {
  let users: Row[] = await src<Row[]>`
    SELECT p.id, p.name, p.color, u.email
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id`;
  let households: Row[] = await src<Row[]>`SELECT id, name, invite_code, created_at FROM public.households`;
  let members: Row[] = await src<Row[]>`
    SELECT household_id, user_id, joined_at FROM public.household_members ORDER BY joined_at`;
  let expenses: Row[] = await src<Row[]>`SELECT * FROM public.expenses`;
  let settlements: Row[] = await src<Row[]>`SELECT * FROM public.settlements`;

  if (onlyHousehold) {
    households = households.filter((h) => h.invite_code === onlyHousehold);
    if (households.length === 0) throw new Error(`No household with invite code ${onlyHousehold}`);
    const hid = new Set(households.map((h) => h.id));
    members = members.filter((m) => hid.has(m.household_id));
    expenses = expenses.filter((e) => hid.has(e.household_id));
    settlements = settlements.filter((s) => hid.has(s.household_id));
    const uid = new Set<string>([
      ...members.map((m) => m.user_id),
      ...expenses.map((e) => e.paid_by),
      ...settlements.flatMap((s) => [s.from_user_id, s.to_user_id]),
    ]);
    users = users.filter((u) => uid.has(u.id));
  }

  const unmapped = users.filter((u) => !phoneByEmail.has(String(u.email ?? "").toLowerCase()));
  console.log(`users ${users.length} (unmapped phones: ${unmapped.length})`);
  for (const u of unmapped) console.log(`  ! no phone for ${u.email ?? u.id} (${u.name})`);
  console.log(`households ${households.length}, members ${members.length}`);
  console.log(`expenses ${expenses.length}, settlements ${settlements.length}`);

  // Owner = earliest member of each household.
  const ownerOf = new Map<string, string>();
  for (const m of members) if (!ownerOf.has(m.household_id)) ownerOf.set(m.household_id, m.user_id);

  // Categories: defaults + every distinct free-text category used per household.
  const categoryRows: Row[] = [];
  const categoryId = new Map<string, string>(); // `${householdId}|${lowercase name}` → id
  for (const h of households) {
    const names = new Map<string, string>();
    for (const c of DEFAULT_CATEGORIES) names.set(c.name.toLowerCase(), c.name);
    for (const e of expenses) {
      if (e.household_id === h.id && e.category) names.set(String(e.category).toLowerCase(), String(e.category));
    }
    let i = 0;
    for (const [key, name] of names) {
      const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === key);
      const id = randomUUID();
      categoryId.set(`${h.id}|${key}`, id);
      categoryRows.push({
        id, household_id: h.id, name, emoji: def?.emoji ?? "📦",
        color: def?.color ?? USER_COLORS[i % USER_COLORS.length], sort_order: i++,
      });
    }
  }
  console.log(`categories to create ${categoryRows.length}`);

  if (dryRun) {
    console.log("dry run — nothing written");
  } else {
    await dst.begin(async (tx) => {
      for (const [i, u] of users.entries()) {
        await tx`INSERT INTO users (id, phone, name, color) VALUES (
          ${u.id}, ${phoneByEmail.get(String(u.email ?? "").toLowerCase()) ?? null},
          ${u.name || "Member"}, ${u.color || USER_COLORS[i % USER_COLORS.length]})
          ON CONFLICT DO NOTHING`;
      }
      for (const h of households) {
        await tx`INSERT INTO households (id, name, invite_code, currency, owner_id, created_at)
          VALUES (${h.id}, ${h.name}, ${h.invite_code}, ${currency}, ${ownerOf.get(h.id) ?? null}, ${h.created_at})
          ON CONFLICT DO NOTHING`;
      }
      for (const m of members) {
        await tx`INSERT INTO household_members (household_id, user_id, role, joined_at)
          VALUES (${m.household_id}, ${m.user_id},
                  ${ownerOf.get(m.household_id) === m.user_id ? "owner" : "member"}, ${m.joined_at})
          ON CONFLICT DO NOTHING`;
      }
      for (const c of categoryRows) {
        await tx`INSERT INTO categories ${tx(c)} ON CONFLICT DO NOTHING`;
      }
      for (const e of expenses) {
        const cat = categoryId.get(`${e.household_id}|${String(e.category ?? "other").toLowerCase()}`) ?? null;
        await tx`INSERT INTO expenses (id, household_id, paid_by, created_by, amount, date, description,
                                       category_id, note, splits, created_at)
          VALUES (${e.id}, ${e.household_id}, ${e.paid_by}, ${e.paid_by}, ${e.amount},
                  ${String(e.date).slice(0, 10)}, ${e.description}, ${cat}, ${e.note ?? null},
                  ${e.split_ratio ? tx.json(e.split_ratio) : null}, ${e.created_at ?? new Date()})
          ON CONFLICT DO NOTHING`;
      }
      for (const s of settlements) {
        await tx`INSERT INTO settlements (id, household_id, from_user_id, to_user_id, amount, date, note,
                                          created_by, created_at)
          VALUES (${s.id}, ${s.household_id}, ${s.from_user_id}, ${s.to_user_id}, ${s.amount},
                  ${String(s.date).slice(0, 10)}, ${s.note ?? null}, ${s.from_user_id},
                  ${s.created_at ?? new Date()})
          ON CONFLICT DO NOTHING`;
      }
    });
    console.log("import complete");
  }
} finally {
  await src.end();
  await dst.end();
}
