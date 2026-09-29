/** Local-calendar date helpers. Date strings are always "YYYY-MM-DD". */

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDateStr(new Date());
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "YYYY-MM" for a date string or Date */
export function monthKey(d: string | Date): string {
  return typeof d === "string" ? d.slice(0, 7) : toDateStr(d).slice(0, 7);
}

export function monthRange(key: string): { from: string; to: string; days: number } {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${pad(days)}`, days };
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Add `n` days / weeks / months / years, clamping month-end (Jan 31 + 1 month → Feb 28). */
export function addPeriod(date: string, unit: "day" | "week" | "month" | "year", n: number): string {
  const d = parseDate(date);
  if (unit === "day") d.setDate(d.getDate() + n);
  else if (unit === "week") d.setDate(d.getDate() + 7 * n);
  else {
    const day = d.getDate();
    d.setDate(1);
    if (unit === "month") d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, max));
  }
  return toDateStr(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthShort(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}

export function monthLong(key: string): string {
  return parseDate(`${key}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "2 Mar", "Today", "Yesterday" */
export function friendlyDate(s: string): string {
  const t = today();
  if (s === t) return "Today";
  if (s === addPeriod(t, "day", -1)) return "Yesterday";
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}
