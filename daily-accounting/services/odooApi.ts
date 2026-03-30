// -*- coding: utf-8 -*-
// Typed Odoo API calls for the Daily Accounting app

import { callKw, jsonRpc } from "./odooClient";
import {
  CreateEntryVals,
  OdooCategory,
  OdooCurrency,
  OdooDailyEntry,
  OdooSettings,
} from "../types/odoo";

// ── Authentication ───────────────────────────────────────────────────────────

interface AuthResult {
  uid: number | false;
  name?: string;
}

export async function authenticate(settings: OdooSettings): Promise<number> {
  const result = await jsonRpc<AuthResult>(
    settings.baseUrl,
    "/web/session/authenticate",
    {
      db: settings.db,
      login: settings.username,
      password: settings.password,
    }
  );

  if (!result || result.uid === false || result.uid === undefined) {
    throw new Error("Authentication failed. Check your credentials and database name.");
  }

  return result.uid as number;
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(
  settings: OdooSettings,
  uid: number
): Promise<OdooCategory[]> {
  return callKw<OdooCategory[]>(
    settings,
    uid,
    "daily.category",
    "search_read",
    [[["active", "=", true]]],
    {
      fields: ["id", "name", "entry_type", "color"],
      order: "entry_type asc, name asc",
    }
  );
}

/** Create a new category in Odoo. Returns the new record ID. */
export async function createCategory(
  settings: OdooSettings,
  uid: number,
  vals: { name: string; entry_type: "expense" | "income"; color?: number }
): Promise<number> {
  return callKw<number>(settings, uid, "daily.category", "create", [vals]);
}

// ── Currencies ───────────────────────────────────────────────────────────────

export async function getCurrencies(
  settings: OdooSettings,
  uid: number
): Promise<OdooCurrency[]> {
  return callKw<OdooCurrency[]>(
    settings,
    uid,
    "res.currency",
    "search_read",
    [[["active", "=", true]]],
    {
      fields: ["id", "name", "symbol"],
      order: "name asc",
    }
  );
}

export async function getCurrencyIdByName(
  settings: OdooSettings,
  uid: number,
  isoCode: string
): Promise<number> {
  const results = await callKw<OdooCurrency[]>(
    settings,
    uid,
    "res.currency",
    "search_read",
    [[["name", "=", isoCode.toUpperCase()]]],
    { fields: ["id", "name"], limit: 1 }
  );
  if (!results || results.length === 0) {
    throw new Error(`Currency "${isoCode}" not found in Odoo.`);
  }
  return results[0].id;
}

// ── Daily Entries ─────────────────────────────────────────────────────────────

/** Search for a draft entry for the given category on the given date (YYYY-MM-DD). */
export async function searchTodayEntry(
  settings: OdooSettings,
  uid: number,
  categoryId: number,
  date: string
): Promise<OdooDailyEntry | null> {
  const results = await callKw<OdooDailyEntry[]>(
    settings,
    uid,
    "daily.entry",
    "search_read",
    [
      [
        ["category_id", "=", categoryId],
        ["date", "=", date],
        ["state", "=", "draft"],
      ],
    ],
    {
      fields: ["id", "name", "date", "category_id", "amount", "currency_id", "state"],
      limit: 1,
    }
  );
  return results && results.length > 0 ? results[0] : null;
}

/** Create a new daily entry. Returns the new record ID. */
export async function createEntry(
  settings: OdooSettings,
  uid: number,
  vals: CreateEntryVals
): Promise<number> {
  return callKw<number>(settings, uid, "daily.entry", "create", [vals]);
}

/** Add amount to an existing entry (write the new accumulated total). */
export async function updateEntryAmount(
  settings: OdooSettings,
  uid: number,
  entryId: number,
  newAmount: number
): Promise<boolean> {
  return callKw<boolean>(settings, uid, "daily.entry", "write", [
    [entryId],
    { amount: newAmount },
  ]);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

/** Fetch all daily entries within a date range (inclusive). */
export async function getEntriesByDateRange(
  settings: OdooSettings,
  uid: number,
  startDate: string,  // "YYYY-MM-DD"
  endDate: string     // "YYYY-MM-DD"
): Promise<OdooDailyEntry[]> {
  return callKw<OdooDailyEntry[]>(
    settings,
    uid,
    "daily.entry",
    "search_read",
    [
      [
        ["date", ">=", startDate],
        ["date", "<=", endDate],
      ],
    ],
    {
      fields: ["id", "name", "date", "category_id", "amount", "currency_id", "state"],
      order: "date desc",
    }
  );
}

