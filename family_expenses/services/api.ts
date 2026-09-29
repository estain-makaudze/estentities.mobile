import * as SecureStore from "expo-secure-store";
import { getMeta } from "../db/database";

/**
 * Thin fetch wrapper for the family-api server.
 * Errors are typed so the sync engine can tell "try again later" (network,
 * 5xx) from "this op will never succeed" (validation) and "signed out" (auth).
 */

export type ApiErrorKind = "network" | "auth" | "validation" | "http" | "config";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  constructor(kind: ApiErrorKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.kind === "network") return true;
    if (err.kind === "http") return err.status === undefined || err.status >= 500 || err.status === 408 || err.status === 429;
    return false;
  }
  return true;
}

const TOKEN_KEY = "family_api_token";
let tokenCache: string | null | undefined;

export async function loadToken(): Promise<string | null> {
  if (tokenCache === undefined) tokenCache = await SecureStore.getItemAsync(TOKEN_KEY);
  return tokenCache;
}

export async function saveToken(token: string | null) {
  tokenCache = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Server URL: in-app override (Welcome → Server settings) or EXPO_PUBLIC_API_URL. */
export function apiBaseUrl(): string {
  return (getMeta("apiUrl") || process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  timeoutMs = 20000
): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new ApiError("config", "Server address is not set.");
  const token = await loadToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("network", "Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body (proxy error page etc.)
  }
  if (!res.ok) {
    const message = json?.error?.message ?? `Server error (${res.status})`;
    const code = json?.error?.code;
    if (res.status === 401) throw new ApiError("auth", message, 401, code);
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new ApiError("validation", message, res.status, code);
    }
    throw new ApiError("http", message, res.status, code);
  }
  return json as T;
}
