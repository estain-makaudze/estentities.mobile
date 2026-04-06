import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Expo SDK 46+ inlines EXPO_PUBLIC_ vars via Metro — no babel plugin needed.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Export a flag so the app can show a user-friendly error instead of crashing.
export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ---------------------------------------------------------------------------
// checkSchema — call once on app startup to detect an unrun migration.
//
// Returns null when the schema is healthy.
// Returns a human-readable string when the migration hasn't been run.
// ---------------------------------------------------------------------------
export async function checkSchema(): Promise<string | null> {
  const { error } = await supabase
    .from("households")
    .select("id")
    .limit(1);

  if (!error) return null;

  // PostgREST returns this code when the table isn't in its schema cache
  // (i.e. the table doesn't exist yet).
  const schemaError =
    error.code === "PGRST204" ||
    error.message?.toLowerCase().includes("schema cache") ||
    error.message?.toLowerCase().includes("relation") ||
    error.message?.toLowerCase().includes("does not exist");

  if (schemaError) {
    return (
      "Database tables not found.\n\n" +
      "The SQL migration has not been run yet.\n\n" +
      "Go to your Supabase dashboard → SQL Editor and run the file at:\n" +
      "supabase/migrations/001_initial_schema.sql"
    );
  }

  // Any other error (e.g. network offline) — not a schema problem.
  return null;
}


