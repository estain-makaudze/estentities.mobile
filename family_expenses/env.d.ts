// EXPO_PUBLIC_ vars are inlined by Metro at build time (set them in eas.json).
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of the family-api server, e.g. https://family.estentities.org */
    EXPO_PUBLIC_API_URL?: string;
  }
}
