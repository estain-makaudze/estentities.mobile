// Expo SDK 46+ exposes EXPO_PUBLIC_ vars via process.env at build time.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  }
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;
}
