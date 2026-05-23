import { OdooSettings } from "../types/odoo";

interface JsonRpcResponse<T = unknown> {
  id: number;
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: {
      name?: string;
      message?: string;
      arguments?: unknown[];
    };
  };
}

/**
 * How a failure should be treated by the offline sync queue:
 *  - "network": no/lost connectivity or timeout — safe to retry later.
 *  - "auth":    session/credentials rejected — retry after re-auth.
 *  - "http":    transport-level HTTP error; retryable only for 5xx/408/429.
 *  - "validation": Odoo business rule rejected the call (UserError /
 *                  ValidationError). Will NOT fix itself — surface to the user.
 *  - "server":  unexpected Odoo server error — surface, do not hammer.
 */
export type OdooErrorKind =
  | "network"
  | "auth"
  | "http"
  | "validation"
  | "server";

export class OdooError extends Error {
  readonly kind: OdooErrorKind;
  readonly status?: number;
  readonly odooName?: string;

  constructor(
    message: string,
    kind: OdooErrorKind,
    opts: { status?: number; odooName?: string } = {}
  ) {
    super(message);
    this.name = "OdooError";
    this.kind = kind;
    this.status = opts.status;
    this.odooName = opts.odooName;
  }
}

/** Transient failures the queue may safely retry without user intervention. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof OdooError) {
    if (err.kind === "network" || err.kind === "auth") return true;
    if (err.kind === "http") {
      return (
        err.status === undefined ||
        err.status >= 500 ||
        err.status === 408 ||
        err.status === 429
      );
    }
    return false; // validation / server: do not auto-retry
  }
  // Unknown error shape — assume transient so it is not silently dropped.
  return true;
}

let requestId = 1;

const DEFAULT_TIMEOUT_MS = 20000;

/** Map an Odoo JSON-RPC error payload onto an OdooError kind. */
function classifyOdooError(
  error: NonNullable<JsonRpcResponse["error"]>
): OdooError {
  const odooName = error.data?.name ?? "";
  const message =
    error.data?.message?.trim() ||
    error.message ||
    "Unknown Odoo error";

  if (
    odooName.includes("ValidationError") ||
    odooName.includes("UserError")
  ) {
    return new OdooError(message, "validation", { odooName });
  }
  if (
    odooName.includes("AccessError") ||
    odooName.includes("AccessDenied") ||
    odooName.includes("SessionExpired")
  ) {
    return new OdooError(message, "auth", { odooName });
  }
  return new OdooError(message, "server", { odooName });
}

export async function jsonRpc<T = unknown>(
  baseUrl: string,
  endpoint: string,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${endpoint}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: requestId++,
        params,
      }),
    });
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new OdooError(
      aborted
        ? `Request timed out after ${timeoutMs}ms`
        : `Network request failed: ${e instanceof Error ? e.message : String(e)}`,
      "network"
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new OdooError(
      `HTTP ${response.status}: ${response.statusText}`,
      "http",
      { status: response.status }
    );
  }

  let json: JsonRpcResponse<T>;
  try {
    json = (await response.json()) as JsonRpcResponse<T>;
  } catch {
    throw new OdooError("Odoo returned a non-JSON response", "server");
  }

  if (json.error) {
    throw classifyOdooError(json.error);
  }

  return json.result as T;
}

export async function callKw<T = unknown>(
  settings: OdooSettings,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  return jsonRpc<T>(settings.baseUrl, "/web/dataset/call_kw", {
    model,
    method,
    args,
    kwargs: {
      context: { uid },
      ...kwargs,
    },
  });
}
