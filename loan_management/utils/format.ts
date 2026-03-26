import { Many2OneValue } from "../types/odoo";

export function displayMany2One(value: Many2OneValue, fallback = "-"): string {
  if (Array.isArray(value)) {
    return value[1];
  }
  return fallback;
}

export function formatMoney(amount: number, currency = "UGX"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toFixed(2)}`;
  }
}

export function formatDateLabel(value: string | false | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatRelativeSyncTime(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `Last sync ${date.toLocaleString()}`;
}

export function humanizeStatus(value: string | false | null | undefined): string {
  if (!value) {
    return "No status";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

