import { createHash, randomBytes } from "node:crypto";
import { HTTPException } from "hono/http-exception";

export const USER_COLORS = [
  "#2B3BE0", "#F2994A", "#2BB673", "#9B51E0", "#E5484D", "#12B5B0", "#F2C94C", "#3E7BFA",
];

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeInviteCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return out;
}

export function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Normalise a phone number to E.164. Local numbers ("0771234567") get the
 * default country code (env DEFAULT_COUNTRY_CODE, default 263 / Zimbabwe).
 */
export function normalizePhone(raw: string): string {
  const cc = (process.env.DEFAULT_COUNTRY_CODE ?? "263").replace(/\D/g, "");
  let p = raw.trim().replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) p = p.startsWith("0") ? `+${cc}${p.slice(1)}` : `+${cc}${p}`;
  if (!/^\+[1-9]\d{7,14}$/.test(p)) throw fail(400, "INVALID_PHONE", "Enter a valid phone number.");
  return p;
}

export function fail(status: 400 | 401 | 403 | 404 | 409 | 429, code: string, message: string) {
  return new HTTPException(status, { message, cause: { code } });
}

export const DEFAULT_CATEGORIES: { name: string; emoji: string; color: string }[] = [
  { name: "Groceries", emoji: "🛒", color: "#2B3BE0" },
  { name: "Utilities", emoji: "💡", color: "#F2C94C" },
  { name: "Rent", emoji: "🏠", color: "#9B51E0" },
  { name: "Transport", emoji: "🚗", color: "#12B5B0" },
  { name: "Dining", emoji: "🍽️", color: "#F2994A" },
  { name: "Health", emoji: "💊", color: "#E5484D" },
  { name: "Entertainment", emoji: "🎬", color: "#3E7BFA" },
  { name: "Other", emoji: "📦", color: "#8A8F9C" },
];
