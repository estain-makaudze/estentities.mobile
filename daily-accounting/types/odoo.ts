// -*- coding: utf-8 -*-
// Shared TypeScript interfaces for Odoo integration

export interface OdooSettings {
  baseUrl: string;      // e.g. https://myodoo.com  (no trailing slash)
  db: string;           // Odoo database name
  username: string;     // Odoo login (email or username)
  password: string;     // Password or API key
  defaultCurrency: string; // ISO code, e.g. "USD"
}

export interface OdooCategory {
  id: number;
  name: string;
  entry_type: "expense" | "income";
  color: number;
}

export interface OdooCurrency {
  id: number;
  name: string;   // ISO code, e.g. "USD"
  symbol: string;
}

export interface OdooDailyEntry {
  id: number;
  name: string;
  date: string;          // "YYYY-MM-DD"
  category_id: [number, string];
  amount: number;
  currency_id: [number, string];
  state: "draft" | "summarised";
}

export interface CreateEntryVals {
  name: string;
  date: string;
  category_id: number;
  amount: number;
  currency_id: number;
  note?: string;
  state: "draft";
}

