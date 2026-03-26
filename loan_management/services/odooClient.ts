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

let requestId = 1;

export async function jsonRpc<T = unknown>(
  baseUrl: string,
  endpoint: string,
  params: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: requestId++,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(
      json.error.data?.message || json.error.message || "Unknown Odoo error"
    );
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

