import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { db, getMeta, setMeta } from "../db/database";
import { categoryTotals, totalBetween } from "../db/queries";
import { listAll } from "../db/repo";
import type { Budget, Category, Recurring } from "../types";
import { addPeriod, monthKey, monthRange, parseDate, today } from "./dates";
import { formatMoney } from "./format";

/**
 * Local notifications (no push server needed):
 *  - budget alerts when a category / the whole family crosses 80% and 100%
 *    (each fires once per month per budget, on any device that notices first)
 *  - bill reminders the morning before a recurring expense is due
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permission: boolean | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Budget & bills",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    permission = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  } catch {
    permission = false;
  }
  return permission;
}

export type BudgetStatus = {
  budget: Budget;
  category: Category | null;
  spent: number;
  ratio: number;
};

export function budgetStatuses(householdId: string, month = monthKey(today())): BudgetStatus[] {
  const { from, to } = monthRange(month);
  const budgets = listAll<Budget>("budgets", householdId).filter((b) => b.amount > 0);
  const cats = listAll<Category>("categories", householdId);
  const totals = new Map(categoryTotals(householdId, from, to).map((t) => [t.categoryId, t.total]));
  const all = totalBetween(householdId, from, to);
  return budgets.map((b) => {
    const spent = b.categoryId ? totals.get(b.categoryId) ?? 0 : all;
    return { budget: b, category: cats.find((c) => c.id === b.categoryId) ?? null, spent, ratio: spent / b.amount };
  });
}

export async function checkBudgetAlerts(householdId: string, currency: string) {
  const month = monthKey(today());
  const hits: { key: string; title: string; body: string }[] = [];
  for (const s of budgetStatuses(householdId, month)) {
    const level = s.ratio >= 1 ? 100 : s.ratio >= 0.8 ? 80 : 0;
    if (!level) continue;
    const key = `alert:${month}:${s.budget.categoryId ?? "total"}:${level}`;
    if (getMeta(key)) continue;
    setMeta(key, "1");
    const name = s.category ? `${s.category.emoji} ${s.category.name}` : "Family budget";
    hits.push({
      key,
      title: level === 100 ? `${name}: budget exceeded` : `${name}: 80% of budget used`,
      body: `${formatMoney(s.spent, currency)} of ${formatMoney(s.budget.amount, currency)} spent this month.`,
    });
  }
  if (hits.length === 0 || !(await ensureNotificationPermission())) return;
  for (const h of hits) {
    await Notifications.scheduleNotificationAsync({ content: { title: h.title, body: h.body }, trigger: null });
  }
}

/** Re-schedule bill reminders (9:00 the day before each active recurring expense). */
export async function scheduleBillReminders(householdId: string, currency: string) {
  const recurring = listAll<Recurring>("recurring", householdId).filter((r) => r.active);
  const signature = recurring.map((r) => `${r.id}:${r.nextDue}:${r.amount}`).join("|");
  if (getMeta("billReminderSig") === signature) return;
  if (recurring.length > 0 && !(await ensureNotificationPermission())) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.kind === "bill") await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  const now = Date.now();
  for (const r of recurring) {
    const when = parseDate(addPeriod(r.nextDue, "day", -1));
    when.setHours(9, 0, 0, 0);
    if (when.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Bill due tomorrow: ${r.description}`,
        body: `${formatMoney(r.amount, currency)} will be added to your family expenses.`,
        data: { kind: "bill", url: "/recurring" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }
  setMeta("billReminderSig", signature);
}

// ── Daily "did you enter today's expenses?" reminder ────────────────────────

export const REMINDER_TIMES = ["18:00", "19:00", "20:00", "21:00"];

export function getReminderSettings(): { enabled: boolean; time: string } {
  return { enabled: getMeta("reminderEnabled") !== "0", time: getMeta("reminderTime") ?? "19:00" };
}

export function setReminderSettings(patch: { enabled?: boolean; time?: string }) {
  if (patch.enabled !== undefined) setMeta("reminderEnabled", patch.enabled ? "1" : "0");
  if (patch.time) setMeta("reminderTime", patch.time);
  setMeta("dailyReminderSig", null); // force reschedule
}

/**
 * Schedule the evening reminder for the next 7 days as local notifications
 * (they fire even when the app is closed). Today's is skipped once you've
 * entered an expense today. Re-run on app open, after data changes and from
 * the background task, so the window keeps rolling forward.
 */
export async function scheduleDailyReminders(householdId: string, userId: string) {
  const { enabled, time } = getReminderSettings();
  const t = today();
  const enteredToday =
    (db.getFirstSync<{ n: number }>(
      `SELECT count(*) AS n FROM expenses WHERE household_id = ? AND date = ? AND deleted_at IS NULL
         AND (created_by = ? OR created_by IS NULL)`,
      householdId, t, userId
    )?.n ?? 0) > 0;
  const signature = `${enabled}|${time}|${t}|${enteredToday}`;
  if (getMeta("dailyReminderSig") === signature) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.kind === "daily") await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  if (enabled && (await ensureNotificationPermission())) {
    const [hh, mm] = time.split(":").map(Number);
    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      const day = addPeriod(t, "day", i);
      if (i === 0 && enteredToday) continue;
      const when = parseDate(day);
      when.setHours(hh, mm, 0, 0);
      if (when.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Did you enter today's expenses? 📝",
          body: "Take 30 seconds to add what the family spent today — it keeps your budget and balances accurate.",
          data: { kind: "daily", url: "/add-expense" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  }
  setMeta("dailyReminderSig", signature);
}
