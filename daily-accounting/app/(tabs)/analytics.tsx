import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function monthLabel(d: Date) { return d.toLocaleString("default", { month: "short", year: "numeric" }); }

interface CategoryBreakdown {
  name: string;
  amount: number;
  count: number;
}

interface MonthData {
  label: string;
  total: number;
  currency: string;
  breakdown: CategoryBreakdown[];
  entryCount: number;
}

function buildMonthData(entries: OdooDailyEntry[], label: string): MonthData {
  const map = new Map<string, { amount: number; count: number }>();
  let total = 0;
  let currency = "";
  for (const e of entries) {
    total += e.amount;
    if (!currency && Array.isArray(e.currency_id)) currency = e.currency_id[1] || "";
    const catName = Array.isArray(e.category_id) ? e.category_id[1] : "Other";
    const cur = map.get(catName) || { amount: 0, count: 0 };
    map.set(catName, { amount: cur.amount + e.amount, count: cur.count + 1 });
  }
  const breakdown: CategoryBreakdown[] = Array.from(map.entries())
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
  return { label, total, currency, breakdown, entryCount: entries.length };
}

const CATEGORY_COLORS = [
  "#2563EB", "#7C3AED", "#EF4444", "#F59E0B", "#10B981",
  "#F97316", "#06B6D4", "#EC4899", "#84CC16", "#6B7280",
];

function fmt(amount: number, currency: string) {
  return `${currency ? currency + " " : ""}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SimpleBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(4, (value / max) * 100)) : 4;
  return (
    <View style={{ height: 10, backgroundColor: "#F1F5F9", borderRadius: 5, overflow: "hidden", flexDirection: "row" }}>
      <View style={{ flex: pct, height: 10, backgroundColor: color, borderRadius: 5 }} />
      <View style={{ flex: 100 - pct }} />
    </View>
  );
}

export default function AnalyticsScreen() {
  const { settings, isLoaded } = useSettings();
  const [thisMonth, setThisMonth] = useState<MonthData | null>(null);
  const [lastMonth, setLastMonth] = useState<MonthData | null>(null);
  const [trend, setTrend] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = !!(settings.baseUrl && settings.db && settings.username && settings.password);

  const loadAnalytics = useCallback(
    async (isRefresh = false) => {
      if (!isConfigured || !isLoaded) return;
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const uid = await authenticate(settings);

        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const [thisEntries, lastEntries] = await Promise.all([
          getEntriesByDateRange(settings, uid, formatDate(startOfMonth(now)), formatDate(endOfMonth(now))),
          getEntriesByDateRange(settings, uid, formatDate(startOfMonth(prevMonthDate)), formatDate(endOfMonth(prevMonthDate))),
        ]);

        setThisMonth(buildMonthData(thisEntries || [], monthLabel(now)));
        setLastMonth(buildMonthData(lastEntries || [], monthLabel(prevMonthDate)));

        const trendData: MonthData[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const entries = await getEntriesByDateRange(settings, uid, formatDate(startOfMonth(d)), formatDate(endOfMonth(d)));
          trendData.push(buildMonthData(entries || [], monthLabel(d)));
        }
        setTrend(trendData);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isConfigured, isLoaded, settings]
  );

  useFocusEffect(useCallback(() => { loadAnalytics(); }, [loadAnalytics]));

  if (!isLoaded) {
    return <View style={s.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  if (!isConfigured) {
    return (
      <View style={s.centered}>
        <Ionicons name="bar-chart-outline" size={52} color="#9CA3AF" />
        <Text style={s.emptyText}>Configure your Odoo connection in{" "}<Text style={s.link}>Settings</Text> to see analytics.</Text>
      </View>
    );
  }

  const currency = thisMonth?.currency || lastMonth?.currency || settings.defaultCurrency || "";
  const maxTrend = Math.max(...trend.map((m) => m.total), 1);
  const maxCat = Math.max(...(thisMonth?.breakdown.map((b) => b.amount) || [1]), 1);

  const delta =
    thisMonth && lastMonth && lastMonth.total > 0
      ? ((thisMonth.total - lastMonth.total) / lastMonth.total) * 100
      : null;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAnalytics(true)} colors={["#2563EB"]} tintColor="#2563EB" />}
    >
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadAnalytics()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.sectionTitle}>MONTH COMPARISON</Text>
      <View style={s.compareRow}>
        <View style={[s.compareCard, { borderTopColor: "#7C3AED" }]}>
          <Text style={s.compareLabel}>Last Month</Text>
          {loading ? <ActivityIndicator color="#7C3AED" /> : (
            <>
              <Text style={[s.compareAmount, { color: "#7C3AED" }]}>{fmt(lastMonth?.total ?? 0, currency)}</Text>
              <Text style={s.compareCount}>{lastMonth?.entryCount ?? 0} entries</Text>
            </>
          )}
        </View>
        <View style={[s.compareCard, { borderTopColor: "#2563EB" }]}>
          <Text style={s.compareLabel}>This Month</Text>
          {loading ? <ActivityIndicator color="#2563EB" /> : (
            <>
              <Text style={[s.compareAmount, { color: "#2563EB" }]}>{fmt(thisMonth?.total ?? 0, currency)}</Text>
              <Text style={s.compareCount}>{thisMonth?.entryCount ?? 0} entries</Text>
            </>
          )}
        </View>
      </View>

      {delta !== null && !loading && (
        <View style={[s.deltaBanner, delta > 0 ? s.deltaUp : s.deltaDown]}>
          <Ionicons
            name={delta > 0 ? "trending-up" : "trending-down"}
            size={18}
            color={delta > 0 ? "#DC2626" : "#16A34A"}
          />
          <Text style={[s.deltaText, { color: delta > 0 ? "#DC2626" : "#16A34A" }]}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs last month
          </Text>
        </View>
      )}

      <Text style={s.sectionTitle}>THIS MONTH BY CATEGORY</Text>
      <View style={s.card}>
        {loading ? (
          <ActivityIndicator color="#2563EB" />
        ) : !thisMonth || thisMonth.breakdown.length === 0 ? (
          <Text style={s.emptyHint}>No entries this month.</Text>
        ) : (
          thisMonth.breakdown.map((cat, i) => (
            <View key={cat.name} style={s.catRow}>
              <View style={[s.catDot, { backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }]} />
              <View style={{ flex: 1 }}>
                <View style={s.catHeader}>
                  <Text style={s.catName} numberOfLines={1}>{cat.name}</Text>
                  <Text style={s.catAmount}>{fmt(cat.amount, currency)}</Text>
                </View>
                <SimpleBar value={cat.amount} max={maxCat} color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
              </View>
            </View>
          ))
        )}
      </View>

      <Text style={s.sectionTitle}>6-MONTH TREND</Text>
      <View style={s.card}>
        {loading ? (
          <ActivityIndicator color="#2563EB" />
        ) : trend.length === 0 ? (
          <Text style={s.emptyHint}>No data available.</Text>
        ) : (
          trend.map((m, i) => (
            <View key={m.label} style={s.trendRow}>
              <Text style={s.trendLabel}>{m.label}</Text>
              <View style={{ flex: 1, paddingHorizontal: 8 }}>
                <SimpleBar value={m.total} max={maxTrend} color={i === trend.length - 1 ? "#2563EB" : "#93C5FD"} />
              </View>
              <Text style={s.trendAmount}>{fmt(m.total, currency)}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={s.refreshHint}>↓ Pull down to refresh</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  container: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#F1F5F9" },
  emptyText: { marginTop: 12, color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22 },
  link: { color: "#2563EB", fontWeight: "600" },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  compareRow: { flexDirection: "row", gap: 10 },
  compareCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, borderTopWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  compareLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600", marginBottom: 6 },
  compareAmount: { fontSize: 20, fontWeight: "800" },
  compareCount: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  deltaBanner: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginTop: 8, marginBottom: 4 },
  deltaUp: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  deltaDown: { backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC" },
  deltaText: { fontSize: 14, fontWeight: "600" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  catHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 13, fontWeight: "600", color: "#374151", flex: 1 },
  catAmount: { fontSize: 13, fontWeight: "700", color: "#111827" },
  trendRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  trendLabel: { width: 64, fontSize: 12, color: "#6B7280", fontWeight: "500" },
  trendAmount: { width: 80, fontSize: 12, color: "#374151", fontWeight: "600", textAlign: "right" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12, marginBottom: 12, flexWrap: "wrap" },
  errorText: { color: "#DC2626", flex: 1, fontSize: 13 },
  retryBtn: { marginLeft: "auto" as any },
  retryText: { color: "#2563EB", fontWeight: "600", fontSize: 13 },
  emptyHint: { color: "#9CA3AF", textAlign: "center", padding: 12 },
  refreshHint: { textAlign: "center", color: "#D1D5DB", fontSize: 12, marginTop: 20 },
});
