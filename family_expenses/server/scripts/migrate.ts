/**
 * Applies migrations/*.sql in filename order, once each (tracked in schema_migrations).
 * Usage: DATABASE_URL=postgres://... npm run migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export async function migrate(url: string, log = console.log) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const [done] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${f}`;
      if (done) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(dir, f), "utf8"));
        await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
      });
      log(`applied ${f}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await migrate(url);
  console.log("migrations up to date");
}
