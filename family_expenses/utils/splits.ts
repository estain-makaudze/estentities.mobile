import { User, SplitEntry } from "../types";

export type SplitMode = "none" | "equal" | "custom";

/**
 * Calculate default percentage for equal splits
 */
export function calculateEqualPercentage(userCount: number): string {
  return userCount > 0 ? (100 / userCount).toFixed(1) : "0";
}

/**
 * Initialize custom percentages with equal distribution
 */
export function initializeEqualPercentages(users: User[]): Record<string, string> {
  const result: Record<string, string> = {};
  const defaultPct = calculateEqualPercentage(users.length);
  for (const u of users) {
    result[u.id] = defaultPct;
  }
  return result;
}

/**
 * Determine split mode from a category's default splits
 */
export function determineSplitMode(
  defaultSplits: SplitEntry[] | null | undefined,
  users: User[]
): SplitMode {
  if (!defaultSplits || defaultSplits.length === 0) {
    return "none";
  }

  // Check if all percentages are equal
  const allEqual = defaultSplits.every(
    (s) => Math.abs(s.percentage - defaultSplits[0].percentage) < 0.1
  );

  return allEqual && defaultSplits.length === users.length ? "equal" : "custom";
}

/**
 * Extract custom percentages from a category's default splits
 */
export function extractCustomPercentages(
  defaultSplits: SplitEntry[] | null | undefined,
  users: User[]
): Record<string, string> {
  if (defaultSplits && defaultSplits.length > 0) {
    const result: Record<string, string> = {};
    for (const u of users) result[u.id] = "0";
    for (const split of defaultSplits) {
      result[split.userId] = split.percentage.toString();
    }
    return result;
  }
  return initializeEqualPercentages(users);
}

/**
 * Build the splits array for a form. Returns an error message string when the
 * custom percentages are invalid.
 */
export function buildSplits(
  mode: SplitMode,
  users: User[],
  customPercentages: Record<string, string>
): SplitEntry[] | null | string {
  if (mode === "none" || users.length === 0) return null;
  if (mode === "equal") {
    const pct = 100 / users.length;
    return users.map((u, i) => ({
      userId: u.id,
      // Distribute remainder to the last entry to ensure sum = 100.
      percentage:
        i === users.length - 1
          ? 100 - parseFloat((pct * (users.length - 1)).toFixed(4))
          : parseFloat(pct.toFixed(4)),
    }));
  }
  const entries: SplitEntry[] = [];
  let total = 0;
  for (const u of users) {
    const pct = parseFloat(customPercentages[u.id] ?? "0");
    if (isNaN(pct) || pct < 0) return `Invalid percentage for ${u.name}.`;
    if (pct > 0) entries.push({ userId: u.id, percentage: pct });
    total += pct;
  }
  if (Math.abs(total - 100) > 0.1) {
    return `Percentages must add up to 100%. Current total: ${total.toFixed(1)}%`;
  }
  return entries;
}
