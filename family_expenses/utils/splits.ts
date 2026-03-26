import { User, SplitEntry, CategoryConfig } from "../types";

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
 * Determine split mode from config
 */
export function determineSplitMode(
  config: CategoryConfig | undefined,
  users: User[]
): SplitMode {
  if (!config?.defaultSplits) {
    return "none";
  }

  // Check if all percentages are equal
  const allEqual = config.defaultSplits.every(
    (s) => Math.abs(s.percentage - config.defaultSplits![0].percentage) < 0.1
  );

  return allEqual && config.defaultSplits.length === users.length ? "equal" : "custom";
}

/**
 * Extract custom percentages from config
 */
export function extractCustomPercentages(
  config: CategoryConfig | undefined,
  users: User[]
): Record<string, string> {
  if (config?.defaultSplits) {
    const result: Record<string, string> = {};
    for (const split of config.defaultSplits) {
      result[split.userId] = split.percentage.toString();
    }
    return result;
  }
  return initializeEqualPercentages(users);
}
