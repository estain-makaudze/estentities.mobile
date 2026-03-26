import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ── Handler (must be set at module level) ────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_ID = "loan_collections";

// ── Setup ─────────────────────────────────────────────────────────────────────

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Loan Collections",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ── Compact formatter for notification body ───────────────────────────────────

function compact(amount: number, currency: string): string {
  if (amount >= 1_000_000) {
    return `${currency} ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${currency} ${(amount / 1_000).toFixed(0)}K`;
  }
  return `${currency} ${amount.toFixed(0)}`;
}

// ── Schedule daily 5 am notification ─────────────────────────────────────────

export async function scheduleDailyLoanNotification(opts: {
  dueCount: number;
  overdueCount: number;
  dueAmount: number;
  overdueAmount: number;
  currency: string;
}): Promise<void> {
  const { dueCount, overdueCount, dueAmount, overdueAmount, currency } = opts;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const total = dueCount + overdueCount;
  if (total === 0) {
    return;
  }

  const parts: string[] = [];
  if (dueCount > 0) {
    parts.push(`${dueCount} due today (${compact(dueAmount, currency)})`);
  }
  if (overdueCount > 0) {
    parts.push(`${overdueCount} overdue (${compact(overdueAmount, currency)})`);
  }

  const title =
    total === 1
      ? "📋 1 Loan Collection Needs Attention"
      : `📋 ${total} Loan Collections Need Attention`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: parts.join(" · "),
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 5,
      minute: 0,
    },
  });
}

