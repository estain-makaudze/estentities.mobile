// Dashboard screen – landing page showing expense summaries, debt tracking, and daily reminder
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, getEntriesByDateRange } from "../../services/odooApi";
import { useAuth } from "../../store/authStore";
import { Debt, useDebts } from "../../store/debtsStore";
import { useSettings } from "../../store/settingsStore";
import { OdooDailyEntry } from "../../types/odoo";

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

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function monthLabel(d: Date): string { return d.toLocaleString("default", { month: "long", year: "numeric" }); }

function getPreviousMonths(count: number): Array<{ start: Date; end: Date; label: string }> {
  const result = [];
  const now = new Date();
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ start: startOfMonth(d), end: endOfMonth(d), label: monthLabel(d) });
  }
  return result;
}

interface MonthSummary {
  label: string;
  totalExpenses: number;
  totalIncome: number;
  currency: string;
  entryCount: number;
}

function sumEntries(entries: OdooDailyEntry[]): { expenses: number; income: number; currency: string } {
  let total = 0;
  let currency = "";
  for (const e of entries) {
    total += e.amount;
    if (!currency && Array.isArray(e.currency_id)) currency = e.currency_id[1] || "";
  }
  return { expenses: total, income: 0, currency };
}

function SummaryCard({
  title, amount, currency, count, icon, color, isLoading,
}: {
  title: string; amount: number; currency: string; count: number;
  icon: keyof typeof Ionicons.glyphMap; color: string; isLoading: boolean;
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
            {month.totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        )}
      </View>
      <Text style={styles.monthCount}>{month.entryCount} entries</Text>
    </View>
  );
}

function DebtCard({ debt, onPaid, onDelete }: { debt: Debt; onPaid: () => void; onDelete: () => void }) {
  const isIOwe = debt.type === "i_owe";
  return (
    <View style={[styles.debtCard, debt.isPaid && styles.debtCardPaid]}>
      <View style={styles.debtCardLeft}>
        <View style={[styles.debtTypeBadge, isIOwe ? styles.debtTypeBadgeOwed : styles.debtTypeBadgeCredit]}>
          <Text style={[styles.debtTypeText, { color: isIOwe ? "#DC2626" : "#16A34A" }]}>
            {isIOwe ? "I owe" : "Owes me"}
          </Text>
        </View>
        <Text style={styles.debtPerson}>{debt.person}</Text>
        {debt.description ? <Text style={styles.debtDesc} numberOfLines={1}>{debt.description}</Text> : null}
        <Text style={styles.debtDate}>{debt.date}</Text>
      </View>
      <View style={styles.debtCardRight}>
        <Text style={[styles.debtAmount, { color: isIOwe ? "#DC2626" : "#16A34A" }]}>
          {isIOwe ? "-" : "+"}{debt.currency} {debt.amount.toFixed(2)}
        </Text>
        {!debt.isPaid && (
          <TouchableOpacity style={styles.paidBtn} onPress={onPaid}>
            <Text style={styles.paidBtnText}>Mark Paid</Text>
          </TouchableOpacity>
        )}
        {debt.isPaid && <Text style={styles.paidLabel}>✓ Paid</Text>}
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { settings, isLoaded } = useSettings();
  const { user, logout } = useAuth();
  const { debts, addDebt, markPaid, deleteDebt } = useDebts();

  const [todayEntries, setTodayEntries] = useState<OdooDailyEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<OdooDailyEntry[]>([]);
  const [prevMonths, setPrevMonths] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderScheduled, setReminderScheduled] = useState(false);
  const notifListener = useRef<Notifications.EventSubscription | null>(null);

  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtType, setDebtType] = useState<"i_owe" | "they_owe">("i_owe");
  const [debtPerson, setDebtPerson] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDesc, setDebtDesc] = useState("");
  const [debtCurrency, setDebtCurrency] = useState(settings.defaultCurrency || "USD");

  const isConfigured = !!(settings.baseUrl && settings.db && settings.username && settings.password);

  useEffect(() => {
    scheduleDailyReminder().then(() => setReminderScheduled(true)).catch(() => {});
    notifListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
    return () => { notifListener.current?.remove(); };
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
        const [todayResult, monthResult] = await Promise.all([
          getEntriesByDateRange(settings, uid, today, today),
          getEntriesByDateRange(settings, uid, monthStart, monthEnd),
        ]);
        setTodayEntries(todayResult || []);
        setMonthEntries(monthResult || []);
        const prev3 = getPreviousMonths(3);
        const monthSummaries: MonthSummary[] = await Promise.all(
          prev3.map(async ({ start, end, label }) => {
            const entries = await getEntriesByDateRange(settings, uid, formatDate(start), formatDate(end));
            const { expenses, currency } = sumEntries(entries || []);
            return { label, totalExpenses: expenses, totalIncome: 0, currency, entryCount: (entries || []).length };
          })
        );
        setPrevMonths(monthSummaries);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isConfigured, isLoaded, settings]
  );

  useFocusEffect(useCallback(() => { loadDashboard(); }, [loadDashboard]));

  const handleAddDebt = async () => {
    const amt = parseFloat(debtAmount.replace(/,/g, "."));
    if (!debtPerson.trim()) { Alert.alert("Missing info", "Enter a person name."); return; }
    if (!amt || amt <= 0) { Alert.alert("Invalid amount", "Enter a valid positive amount."); return; }
    await addDebt({
      type: debtType,
      person: debtPerson.trim(),
      amount: amt,
      currency: debtCurrency.trim().toUpperCase() || "USD",
      description: debtDesc.trim(),
      date: formatDate(new Date()),
    });
    setDebtPerson(""); setDebtAmount(""); setDebtDesc("");
    setShowDebtModal(false);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  const todaySum = sumEntries(todayEntries);
  const monthSum = sumEntries(monthEntries);
  const currency = todaySum.currency || monthSum.currency || settings.defaultCurrency || "";
  const now = new Date();

  const activeDebts = debts.filter((d) => !d.isPaid);
  const iOweTotal = activeDebts.filter((d) => d.type === "i_owe").reduce((s, d) => s + d.amount, 0);
  const owedToMeTotal = activeDebts.filter((d) => d.type === "they_owe").reduce((s, d) => s + d.amount, 0);

  if (!isLoaded) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;
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
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} colors={["#2563EB"]} tintColor="#2563EB" />}
      >
        <View style={styles.greeting}>
          <View>
            <Text style={styles.greetingDate}>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</Text>
            <Text style={styles.greetingTitle}>
              {user ? `Hi, ${user.displayName}` : "Expense Dashboard"}
            </Text>
          </View>
          <View style={styles.greetingRight}>
            <View style={[styles.reminderBadge, reminderScheduled && styles.reminderBadgeActive]}>
              <Ionicons name="notifications-outline" size={16} color={reminderScheduled ? "#16A34A" : "#9CA3AF"} />
              <Text style={[styles.reminderText, reminderScheduled && styles.reminderTextActive]}>
                {reminderScheduled ? "7:30 PM" : "No alert"}
              </Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color="#6B7280" />
            </TouchableOpacity>
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

        <Text style={styles.sectionTitle}>TODAY</Text>
        <SummaryCard title="Today's Expenses" amount={todaySum.expenses} currency={currency} count={todayEntries.length} icon="today-outline" color="#2563EB" isLoading={loading} />

        <Text style={styles.sectionTitle}>THIS MONTH — {monthLabel(now).toUpperCase()}</Text>
        <SummaryCard title="Month-to-Date" amount={monthSum.expenses} currency={currency} count={monthEntries.length} icon="calendar-outline" color="#7C3AED" isLoading={loading} />

        <Text style={styles.sectionTitle}>LAST 3 MONTHS</Text>
        <View style={styles.monthsContainer}>
          {loading ? (
            [0, 1, 2].map((i) => <View key={i} style={styles.monthCard}><ActivityIndicator size="small" color="#2563EB" /></View>)
          ) : prevMonths.length === 0 ? (
            <Text style={styles.emptyHint}>No data available.</Text>
          ) : (
            prevMonths.map((m) => <MonthBarCard key={m.label} month={m} isLoading={false} />)
          )}
        </View>

        <View style={styles.debtHeader}>
          <Text style={styles.sectionTitle}>MONEY TRACKER</Text>
          <TouchableOpacity style={styles.addDebtBtn} onPress={() => setShowDebtModal(true)}>
            <Ionicons name="add" size={16} color="#2563EB" />
            <Text style={styles.addDebtBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.debtSummaryRow}>
          <View style={[styles.debtSummaryCard, { borderTopColor: "#DC2626" }]}>
            <Text style={styles.debtSummaryLabel}>I Owe</Text>
            <Text style={[styles.debtSummaryAmount, { color: "#DC2626" }]}>
              {currency} {iOweTotal.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.debtSummaryCard, { borderTopColor: "#16A34A" }]}>
            <Text style={styles.debtSummaryLabel}>Owed to Me</Text>
            <Text style={[styles.debtSummaryAmount, { color: "#16A34A" }]}>
              {currency} {owedToMeTotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {debts.length === 0 ? (
          <View style={styles.emptyDebt}>
            <Text style={styles.emptyHint}>No debts recorded yet. Tap Add to track money owed.</Text>
          </View>
        ) : (
          <View style={styles.debtList}>
            {debts.map((d) => (
              <DebtCard
                key={d.id}
                debt={d}
                onPaid={() => markPaid(d.id)}
                onDelete={() =>
                  Alert.alert("Delete", "Remove this entry?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteDebt(d.id) },
                  ])
                }
              />
            ))}
          </View>
        )}

        <Text style={styles.refreshHint}>↓ Pull down to refresh</Text>
      </ScrollView>

      <Modal visible={showDebtModal} transparent animationType="slide" onRequestClose={() => setShowDebtModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Debt / IOU</Text>

            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeBtn, debtType === "i_owe" && styles.typeBtnActive]}
                onPress={() => setDebtType("i_owe")}
              >
                <Text style={[styles.typeBtnText, debtType === "i_owe" && styles.typeBtnTextActive]}>I Owe</Text>
              </Pressable>
              <Pressable
                style={[styles.typeBtn, debtType === "they_owe" && styles.typeBtnActive]}
                onPress={() => setDebtType("they_owe")}
              >
                <Text style={[styles.typeBtnText, debtType === "they_owe" && styles.typeBtnTextActive]}>They Owe Me</Text>
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Person / Name</Text>
            <TextInput style={styles.modalInput} value={debtPerson} onChangeText={setDebtPerson} placeholder="e.g. John" />

            <Text style={styles.modalLabel}>Amount</Text>
            <TextInput style={styles.modalInput} value={debtAmount} onChangeText={setDebtAmount} placeholder="0.00" keyboardType="decimal-pad" />

            <Text style={styles.modalLabel}>Currency</Text>
            <TextInput style={styles.modalInput} value={debtCurrency} onChangeText={(t) => setDebtCurrency(t.toUpperCase())} placeholder="USD" autoCapitalize="characters" maxLength={3} />

            <Text style={styles.modalLabel}>Description (optional)</Text>
            <TextInput style={styles.modalInput} value={debtDesc} onChangeText={setDebtDesc} placeholder="e.g. Lunch split" />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowDebtModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleAddDebt}>
                <Text style={styles.confirmBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  container: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#F1F5F9" },
  emptyText: { marginTop: 12, color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22 },
  link: { color: "#2563EB", fontWeight: "600" },
  greeting: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  greetingDate: { fontSize: 13, color: "#6B7280", marginBottom: 2 },
  greetingTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  greetingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3F4F6", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#E5E7EB" },
  reminderBadgeActive: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  reminderText: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  reminderTextActive: { color: "#16A34A" },
  logoutBtn: { padding: 6 },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 18, marginBottom: 12, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#374151" },
  cardAmount: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  cardCount: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  monthsContainer: { gap: 8, marginBottom: 4 },
  monthCard: { backgroundColor: "#FFFFFF", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  monthCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monthLabel: { fontSize: 14, fontWeight: "600", color: "#374151" },
  monthAmount: { fontSize: 16, fontWeight: "700", color: "#2563EB" },
  monthCount: { fontSize: 12, color: "#9CA3AF", marginTop: 3 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12, marginBottom: 12, flexWrap: "wrap" },
  errorText: { color: "#DC2626", flex: 1, fontSize: 13 },
  retryBtn: { marginLeft: "auto" as any },
  retryText: { color: "#2563EB", fontWeight: "600", fontSize: 13 },
  emptyHint: { color: "#9CA3AF", textAlign: "center", padding: 12 },
  refreshHint: { textAlign: "center", color: "#D1D5DB", fontSize: 12, marginTop: 20 },
  debtHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  addDebtBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#BFDBFE" },
  addDebtBtnText: { color: "#2563EB", fontSize: 13, fontWeight: "600" },
  debtSummaryRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  debtSummaryCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, borderTopWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  debtSummaryLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600", marginBottom: 4 },
  debtSummaryAmount: { fontSize: 18, fontWeight: "800" },
  emptyDebt: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 8 },
  debtList: { gap: 8, marginBottom: 8 },
  debtCard: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  debtCardPaid: { opacity: 0.55 },
  debtCardLeft: { flex: 1, gap: 2 },
  debtCardRight: { alignItems: "flex-end", gap: 6 },
  debtTypeBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  debtTypeBadgeOwed: { backgroundColor: "#FEF2F2" },
  debtTypeBadgeCredit: { backgroundColor: "#F0FDF4" },
  debtTypeText: { fontSize: 11, fontWeight: "700" },
  debtPerson: { fontSize: 15, fontWeight: "700", color: "#111827" },
  debtDesc: { fontSize: 12, color: "#6B7280" },
  debtDate: { fontSize: 11, color: "#9CA3AF" },
  debtAmount: { fontSize: 16, fontWeight: "800" },
  paidBtn: { backgroundColor: "#F0FDF4", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#86EFAC" },
  paidBtnText: { color: "#16A34A", fontSize: 11, fontWeight: "600" },
  paidLabel: { color: "#16A34A", fontSize: 11, fontWeight: "600" },
  deleteBtn: { padding: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12 },
  modalLabel: { fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  modalInput: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: { flex: 1, borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  typeBtnActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  typeBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  typeBtnTextActive: { color: "#2563EB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 16, fontWeight: "600", color: "#6B7280" },
  confirmBtn: { flex: 1, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
