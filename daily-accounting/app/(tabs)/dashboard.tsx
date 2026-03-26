// Dashboard screen – landing page showing expense summaries and daily reminder
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, getEntriesByDateRange } from "../../services/odooApi";
import { useSettings } from "../../store/settingsStore";
import { OdooDailyEntry } from "../../types/odoo";

// ─── Notification setup ───────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function scheduleDailyReminder(): Promise<void> {
  // Cancel any previously scheduled reminders first
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === "daily_expense_reminder") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "💰 Daily Expense Reminder",
      body: "Don't forget to log today's expenses!",
      sound: true,
      data: { type: "daily_expense_reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 19,
      minute: 30,
    },
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("default", { month: "long", year: "numeric" });
}

function getPreviousMonths(count: number): Array<{ start: Date; end: Date; label: string }> {
  const result = [];
  const now = new Date();
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      start: startOfMonth(d),
      end: endOfMonth(d),
      label: monthLabel(d),
    });
  }
  return result;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────
interface MonthSummary {
  label: string;
  totalExpenses: number;
  totalIncome: number;
  currency: string;
  entryCount: number;
}

function sumEntries(entries: OdooDailyEntry[]): { expenses: number; income: number; currency: string } {
  // Simplified: sum amounts (treat all as expenses unless we have category type info)
  // We'll sum all amounts and use the first currency found
  let total = 0;
  let currency = "";
  for (const e of entries) {
    total += e.amount;
    if (!currency && Array.isArray(e.currency_id)) {
      currency = e.currency_id[1] || "";
    }
  }
  return { expenses: total, income: 0, currency };
}

// ─── Components ───────────────────────────────────────────────────────────────
function SummaryCard({
  title,
  amount,
  currency,
  count,
  icon,
  color,
  isLoading,
}: {
  title: string;
  amount: number;
  currency: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isLoading: boolean;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBox, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={color} style={{ marginTop: 8 }} />
      ) : (
        <>
          <Text style={[styles.cardAmount, { color }]}>
            {currency ? `${currency} ` : ""}
            {amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.cardCount}>{count} {count === 1 ? "entry" : "entries"}</Text>
        </>
      )}
    </View>
  );
}

function MonthBarCard({ month, isLoading }: { month: MonthSummary; isLoading: boolean }) {
  return (
    <View style={styles.monthCard}>
      <View style={styles.monthCardHeader}>
        <Text style={styles.monthLabel}>{month.label}</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color="#2563EB" />
        ) : (
          <Text style={styles.monthAmount}>
            {month.currency ? `${month.currency} ` : ""}
            {month.totalExpenses.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        )}
      </View>
      <Text style={styles.monthCount}>{month.entryCount} entries</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { settings, isLoaded } = useSettings();

  const [todayEntries, setTodayEntries] = useState<OdooDailyEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<OdooDailyEntry[]>([]);
  const [prevMonths, setPrevMonths] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderScheduled, setReminderScheduled] = useState(false);
  const notifListener = useRef<Notifications.EventSubscription | null>(null);

  const isConfigured = !!(
    settings.baseUrl && settings.db && settings.username && settings.password
  );

  // Schedule daily reminder once
  useEffect(() => {
    scheduleDailyReminder()
      .then(() => setReminderScheduled(true))
      .catch(() => {});

    // Listen for notification responses
    notifListener.current = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Could navigate to entry screen here if desired
    });

    return () => {
      notifListener.current?.remove();
    };
  }, []);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (!isConfigured || !isLoaded) return;
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      try {
        const now = new Date();
        const today = formatDate(now);
        const monthStart = formatDate(startOfMonth(now));
        const monthEnd = formatDate(endOfMonth(now));

        const uid = await authenticate(settings);

        // Today + current month in parallel
        const [todayResult, monthResult] = await Promise.all([
          getEntriesByDateRange(settings, uid, today, today),
          getEntriesByDateRange(settings, uid, monthStart, monthEnd),
        ]);

        setTodayEntries(todayResult || []);
        setMonthEntries(monthResult || []);

        // Previous 3 months sequentially is OK (small data)
        const prev3 = getPreviousMonths(3);
        const monthSummaries: MonthSummary[] = await Promise.all(
          prev3.map(async ({ start, end, label }) => {
            const entries = await getEntriesByDateRange(
              settings,
              uid,
              formatDate(start),
              formatDate(end)
            );
            const { expenses, currency } = sumEntries(entries || []);
            return {
              label,
              totalExpenses: expenses,
              totalIncome: 0,
              currency,
              entryCount: (entries || []).length,
            };
          })
        );
        setPrevMonths(monthSummaries);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isConfigured, isLoaded, settings]
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const todaySum = sumEntries(todayEntries);
  const monthSum = sumEntries(monthEntries);
  const currency = todaySum.currency || monthSum.currency || settings.defaultCurrency || "";

  const now = new Date();

  if (!isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!isConfigured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={52} color="#9CA3AF" />
        <Text style={styles.emptyText}>
          Configure your Odoo connection in the{" "}
          <Text style={styles.link}>Settings</Text> tab to see your dashboard.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDashboard(true)}
          colors={["#2563EB"]}
          tintColor="#2563EB"
        />
      }
    >
      {/* Header greeting */}
      <View style={styles.greeting}>
        <View>
          <Text style={styles.greetingDate}>
            {now.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
          <Text style={styles.greetingTitle}>Expense Dashboard</Text>
        </View>
        <View style={[styles.reminderBadge, reminderScheduled && styles.reminderBadgeActive]}>
          <Ionicons
            name="notifications-outline"
            size={16}
            color={reminderScheduled ? "#16A34A" : "#9CA3AF"}
          />
          <Text
            style={[
              styles.reminderText,
              reminderScheduled && styles.reminderTextActive,
            ]}
          >
            {reminderScheduled ? "7:30 PM" : "No alert"}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadDashboard()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Today */}
      <Text style={styles.sectionTitle}>TODAY</Text>
      <SummaryCard
        title="Today's Expenses"
        amount={todaySum.expenses}
        currency={currency}
        count={todayEntries.length}
        icon="today-outline"
        color="#2563EB"
        isLoading={loading}
      />

      {/* This month */}
      <Text style={styles.sectionTitle}>THIS MONTH — {monthLabel(now).toUpperCase()}</Text>
      <SummaryCard
        title="Month-to-Date"
        amount={monthSum.expenses}
        currency={currency}
        count={monthEntries.length}
        icon="calendar-outline"
        color="#7C3AED"
        isLoading={loading}
      />

      {/* Last 3 months */}
      <Text style={styles.sectionTitle}>LAST 3 MONTHS</Text>
      <View style={styles.monthsContainer}>
        {loading ? (
          [0, 1, 2].map((i) => (
            <View key={i} style={styles.monthCard}>
              <ActivityIndicator size="small" color="#2563EB" />
            </View>
          ))
        ) : prevMonths.length === 0 ? (
          <Text style={styles.emptyHint}>No data available.</Text>
        ) : (
          prevMonths.map((m) => (
            <MonthBarCard key={m.label} month={m} isLoading={false} />
          ))
        )}
      </View>

      {/* Pull-to-refresh hint */}
      <Text style={styles.refreshHint}>↓ Pull down to refresh</Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  container: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F1F5F9",
  },
  emptyText: {
    marginTop: 12,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  link: { color: "#2563EB", fontWeight: "600" },

  // Greeting header
  greeting: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greetingDate: { fontSize: 13, color: "#6B7280", marginBottom: 2 },
  greetingTitle: { fontSize: 24, fontWeight: "800", color: "#111827" },
  reminderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  reminderBadgeActive: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  reminderText: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  reminderTextActive: { color: "#16A34A" },

  // Section title
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },

  // Summary card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#374151" },
  cardAmount: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  cardCount: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },

  // Month cards
  monthsContainer: { gap: 8, marginBottom: 4 },
  monthCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  monthCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthLabel: { fontSize: 14, fontWeight: "600", color: "#374151" },
  monthAmount: { fontSize: 16, fontWeight: "700", color: "#2563EB" },
  monthCount: { fontSize: 12, color: "#9CA3AF", marginTop: 3 },

  // Error
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  errorText: { color: "#DC2626", flex: 1, fontSize: 13 },
  retryBtn: { marginLeft: "auto" as any },
  retryText: { color: "#2563EB", fontWeight: "600", fontSize: 13 },

  emptyHint: { color: "#9CA3AF", textAlign: "center", padding: 12 },
  refreshHint: {
    textAlign: "center",
    color: "#D1D5DB",
    fontSize: 12,
    marginTop: 20,
  },
});

