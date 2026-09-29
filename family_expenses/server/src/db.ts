import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const sql = postgres(url, {
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idle_timeout: 30,
  // numeric → JS number (amounts are numeric(12,2); well within double precision)
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      serialize: (x: number) => String(x),
      parse: (x: string) => Number(x),
    },
    // date → "YYYY-MM-DD" string (never a JS Date, avoids timezone drift)
    date: {
      to: 1082,
      from: [1082],
      serialize: (x: string) => x,
      parse: (x: string) => x,
    },
  },
  transform: { undefined: null },
});

export type Tx = postgres.TransactionSql;

/** Serialises writers so `rev` values become visible in commit order. */
export const REV_LOCK = 424242;
export async function lockRevs(tx: Tx) {
  await tx`SELECT pg_advisory_xact_lock(${REV_LOCK})`;
}
