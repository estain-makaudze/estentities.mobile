// -*- coding: utf-8 -*-
// Low-level Odoo JSON-RPC client (compatible with Odoo 16, 17, 18)

import { OdooSettings } from "../types/odoo";

interface JsonRpcResponse<T = unknown> {
  id: number;
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data: { name: string; message: string; arguments: unknown[] };
  };
}

let _requestId = 1;

/**
 * Raw JSON-RPC POST to any Odoo endpoint.
 * `params` is sent as-is inside the JSON-RPC envelope.
 */
export async function jsonRpc<T = unknown>(
  baseUrl: string,
  endpoint: string,
  params: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${endpoint}`;
  const id = _requestId++;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id,
      params,          // ← params goes here at top level, NOT nested
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json: JsonRpcResponse<T> = await response.json();

  if (json.error) {
    const msg =
      json.error.data?.message || json.error.message || "Unknown Odoo error";
    throw new Error(msg);
  }

  return json.result as T;
}

/**
 * Call an Odoo model method via /web/dataset/call_kw.
 *
 * Odoo 16/17/18 accept:
 *   POST /web/dataset/call_kw
 *   body.params = { model, method, args, kwargs }
 *
 * Some Odoo 17+ setups also accept:
 *   POST /web/dataset/call_kw/{model}/{method}
 *
 * We use the base path with all fields in params — works on all versions.
 */
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
