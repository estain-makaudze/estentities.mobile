import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScheduleDetailModal } from "../ScheduleDetailModal";
import { useCache } from "../../store/cacheStore";
import { useSettings } from "../../store/settingsStore";
import { LoanSchedule, LoanScheduleLine, Many2OneValue } from "../../types/odoo";
import { formatDateLabel, formatMoney, formatRelativeSyncTime } from "../../utils/format";
import { scheduleDailyLoanNotification } from "../../utils/notifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateOffsetLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayLongLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function displayM2O(value: Many2OneValue, fallback = "-"): string {
  return Array.isArray(value) ? value[1] : fallback;
}

function stateBadge(state: string) {
  switch (state) {
    case "missed":
      return { bg: "#FEE2E2", text: "#991B1B", label: "Missed" };
    case "unpaid":
    default:
      return { bg: "#DBEAFE", text: "#1D4ED8", label: "Unpaid" };
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  iconColor,
  bgColor,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bgColor: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor }]}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: iconColor }]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Collection line card ──────────────────────────────────────────────────────

function LineCard({
  line,
  partnerName,
  currency,
  onPress,
}: {
  line: LoanScheduleLine;
  partnerName: string;
  currency: string;
  onPress: () => void;
}) {
  const badge = stateBadge(line.state);
  const daysOverdue = useMemo(() => {
    const today = new Date();
    const due = new Date(line.payment_date);
    const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return diff > 0 ? diff : 0;
  }, [line.payment_date]);

  return (
    <TouchableOpacity style={styles.lineCard} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.lineCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.linePartner} numberOfLines={1}>
            {partnerName}
          </Text>
          <Text style={styles.lineInvoice} numberOfLines={1}>
            {displayM2O(line.invoice_id, "Unknown invoice")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.lineAmount}>{formatMoney(line.expected_amount, currency)}</Text>
          <Ionicons name="chevron-forward-outline" size={14} color="#9CA3AF" style={{ marginTop: 4 }} />
        </View>
      </View>

      <View style={styles.lineCardFooter}>
        <View style={styles.lineDateRow}>
          <Ionicons name="calendar-outline" size={13} color="#6B7280" />
          <Text style={styles.lineDate}>{formatDateLabel(line.payment_date)}</Text>
          {daysOverdue > 0 ? (
            <View style={styles.overdueTag}>
              <Text style={styles.overdueTagText}>{daysOverdue}d overdue</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.lineBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.lineBadgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>

      {line.note ? (
        <Text style={styles.lineNote} numberOfLines={1}>
          {line.note}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, color }: { title: string; count: number; color?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionBadge, { backgroundColor: color ?? "#2563EB" }]}>
        <Text style={styles.sectionBadgeText}>{count}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const {
    dueLines,
    schedules,
    isLoaded,
    isOnline,
    refreshingDueLines,
    refreshingSchedules,
    refreshAll,
  } = useCache();

  const [error, setError] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<LoanSchedule | null>(null);

  const configured = useMemo(
    () => !!(settings.baseUrl && settings.db && settings.username && settings.password),
    [settings]
  );

  const currency = settings.defaultCurrency || "UGX";
  const today = todayLocal();
  const yesterday = dateOffsetLocal(1);
  const twoDaysAgo = dateOffsetLocal(2);
  const threeDaysAgo = dateOffsetLocal(3);

  // Build partner name lookup from cached schedules
  const schedulePartnerMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of schedules.items) {
      if (Array.isArray(s.partner_id)) {
        map[s.id] = s.partner_id[1];
      }
    }
    return map;
  }, [schedules.items]);

  // Build schedule lookup by id
  const scheduleById = useMemo(() => {
    const map: Record<number, LoanSchedule> = {};
    for (const s of schedules.items) {
      map[s.id] = s;
    }
    return map;
  }, [schedules.items]);

  const getPartner = (scheduleId: Many2OneValue): string => {
    if (!Array.isArray(scheduleId)) return "Unknown customer";
    return schedulePartnerMap[scheduleId[0]] ?? scheduleId[1] ?? "Unknown customer";
  };

  const handleLinePress = useCallback((line: LoanScheduleLine) => {
    const schedId = Array.isArray(line.schedule_id) ? line.schedule_id[0] : 0;
    const schedule = scheduleById[schedId];
    if (schedule) {
      setSelectedSchedule(schedule);
    }
  }, [scheduleById]);

  // Group due lines by date period
  const todayLines = useMemo(
    () => dueLines.items.filter((l) => l.payment_date === today),
    [dueLines.items, today]
  );

  const yesterdayLines = useMemo(
    () => dueLines.items.filter((l) => l.payment_date === yesterday),
    [dueLines.items, yesterday]
  );

  // "3 Days Ago" group: between 2-3 days ago (inclusive)
  const threeDaysAgoLines = useMemo(
    () => dueLines.items.filter((l) => l.payment_date <= twoDaysAgo && l.payment_date >= threeDaysAgo),
    [dueLines.items, twoDaysAgo, threeDaysAgo]
  );

  // "More Due Accounts": older than 3 days
  const olderLines = useMemo(
    () => dueLines.items.filter((l) => l.payment_date < threeDaysAgo),
    [dueLines.items, threeDaysAgo]
  );

  // Aggregate amounts
  const todayAmount = useMemo(
    () => todayLines.reduce((s, l) => s + l.expected_amount, 0),
    [todayLines]
  );

  const overdueLines = useMemo(
    () => dueLines.items.filter((l) => l.payment_date < today),
    [dueLines.items, today]
  );

  const overdueAmount = useMemo(
    () => overdueLines.reduce((s, l) => s + l.expected_amount, 0),
    [overdueLines]
  );

  const atRiskCount = useMemo(
    () => schedules.items.filter((s) => s.management_status === "at_risk").length,
    [schedules.items]
  );

  const noValidPlanCount = useMemo(
    () => schedules.items.filter((s) => s.management_status === "no_valid_plan").length,
    [schedules.items]
  );

  const nonCommunicatingCount = useMemo(
    () => schedules.items.filter((s) => s.management_status === "non_communicating").length,
    [schedules.items]
  );

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    if (!configured) return;
    setError(null);
    try {
      await refreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [configured, refreshAll]);

  // Auto-load on first focus
  useFocusEffect(
    useCallback(() => {
      if (settingsLoaded && isLoaded && configured && isOnline && !dueLines.fetchedAt && !refreshingDueLines) {
        handleRefresh();
      }
    }, [configured, dueLines.fetchedAt, handleRefresh, isLoaded, isOnline, refreshingDueLines, settingsLoaded])
  );

  // Schedule daily 5am notification + immediate when data changes
  useEffect(() => {
    if (dueLines.fetchedAt) {
      scheduleDailyLoanNotification({
        dueCount: todayLines.length,
        overdueCount: overdueLines.length,
        dueAmount: todayAmount,
        overdueAmount,
        currency,
      }).catch(() => {});
    }
  }, [currency, dueLines.fetchedAt, overdueAmount, overdueLines.length, todayAmount, todayLines.length]);

  const isRefreshing = refreshingDueLines || refreshingSchedules;

  if (!settingsLoaded || !isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={52} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Setup Required</Text>
        <Text style={styles.emptyText}>
          Go to the Settings tab and enter your Odoo server details to start managing loans.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScheduleDetailModal
        visible={!!selectedSchedule}
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onUpdated={async () => { try { await refreshAll(); } catch { /* silent */ } }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: "#F1F5F9" }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {/* ── Date header ─────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Collections</Text>
            <Text style={styles.pageDate}>{todayLongLabel()}</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={isRefreshing}>
            <Ionicons
              name={isRefreshing ? "sync" : "refresh-outline"}
              size={20}
              color="#2563EB"
            />
          </TouchableOpacity>
        </View>

        {/* ── Network banner ─────────────────────────────────────── */}
        <View style={[styles.networkBanner, isOnline ? styles.bannerOnline : styles.bannerOffline]}>
          <Ionicons
            name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
            size={16}
            color={isOnline ? "#166534" : "#92400E"}
          />
          <Text style={[styles.networkText, { color: isOnline ? "#166534" : "#92400E" }]}>
            {isOnline
              ? `Online · ${formatRelativeSyncTime(dueLines.fetchedAt)}`
              : "Offline · Showing cached data"}
          </Text>
        </View>

        {/* ── Error banner ───────────────────────────────────────── */}
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── Stats grid ─────────────────────────────────────────── */}
        <Text style={styles.gridTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="today-outline"
            iconColor="#1D4ED8"
            bgColor="#EFF6FF"
            label="Due Today"
            value={todayLines.length}
            sub={formatMoney(todayAmount, currency)}
          />
          <StatCard
            icon="alert-circle-outline"
            iconColor="#B91C1C"
            bgColor="#FEF2F2"
            label="Overdue"
            value={overdueLines.length}
            sub={formatMoney(overdueAmount, currency)}
          />
          <StatCard
            icon="warning-outline"
            iconColor="#C2410C"
            bgColor="#FFF7ED"
            label="At Risk"
            value={atRiskCount}
            sub="loans"
          />
          <StatCard
            icon="time-outline"
            iconColor="#7C3AED"
            bgColor="#F5F3FF"
            label="No Valid Plan"
            value={noValidPlanCount}
            sub="loans"
          />
          <StatCard
            icon="phone-portrait-outline"
            iconColor="#0F766E"
            bgColor="#F0FDFA"
            label="Non-Communicating"
            value={nonCommunicatingCount}
            sub="loans"
          />
          <StatCard
            icon="albums-outline"
            iconColor="#6B7280"
            bgColor="#F9FAFB"
            label="Total Schedules"
            value={schedules.items.length}
            sub="active"
          />
        </View>

        {/* ── Tap hint ───────────────────────────────────────────── */}
        {dueLines.items.length > 0 ? (
          <View style={styles.tapHint}>
            <Ionicons name="hand-left-outline" size={13} color="#6B7280" />
            <Text style={styles.tapHintText}>Tap a card to edit or record a payment</Text>
          </View>
        ) : null}

        {/* ── Due Today ──────────────────────────────────────────── */}
        <SectionHeader title="Due Today" count={todayLines.length} color="#1D4ED8" />
        {todayLines.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="checkmark-circle-outline" size={36} color="#22C55E" />
            <Text style={styles.emptySectionText}>No collections due today 🎉</Text>
          </View>
        ) : (
          <View style={styles.lineList}>
            {todayLines.map((line) => (
              <LineCard
                key={line.id}
                line={line}
                partnerName={getPartner(line.schedule_id)}
                currency={currency}
                onPress={() => handleLinePress(line)}
              />
            ))}
          </View>
        )}

        {/* ── Yesterday ──────────────────────────────────────────── */}
        {yesterdayLines.length > 0 ? (
          <>
            <SectionHeader title="Yesterday" count={yesterdayLines.length} color="#B45309" />
            <View style={styles.lineList}>
              {yesterdayLines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  partnerName={getPartner(line.schedule_id)}
                  currency={currency}
                  onPress={() => handleLinePress(line)}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* ── 3 Days Ago ─────────────────────────────────────────── */}
        {threeDaysAgoLines.length > 0 ? (
          <>
            <SectionHeader title="3 Days Ago" count={threeDaysAgoLines.length} color="#991B1B" />
            <View style={styles.lineList}>
              {threeDaysAgoLines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  partnerName={getPartner(line.schedule_id)}
                  currency={currency}
                  onPress={() => handleLinePress(line)}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* ── More Due Accounts (older than 3 days) ──────────────── */}
        {olderLines.length > 0 ? (
          <>
            <SectionHeader title="More Due Accounts" count={olderLines.length} color="#6B7280" />
            <View style={styles.lineList}>
              {olderLines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  partnerName={getPartner(line.schedule_id)}
                  currency={currency}
                  onPress={() => handleLinePress(line)}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F1F5F9",
  },
  loadingText: {
    marginTop: 12,
    color: "#6B7280",
    fontSize: 15,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },

  // Page header
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  pageDate: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },

  // Network banner
  networkBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  bannerOnline: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  bannerOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  networkText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  // Error banner
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#B91C1C",
  },

  // Stats grid
  gridTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    marginBottom: 8,
  },
  statCard: {
    width: "50%",
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Tap hint
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    marginTop: 4,
  },
  tapHintText: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  sectionBadge: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  sectionBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  // Empty section
  emptySection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  emptySectionText: {
    fontSize: 15,
    color: "#166534",
    fontWeight: "600",
  },

  // Line list
  lineList: {
    gap: 10,
  },

  // Line card
  lineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  lineCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  linePartner: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  lineInvoice: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
  },
  lineAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563EB",
  },
  lineCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lineDate: {
    fontSize: 13,
    color: "#6B7280",
  },
  overdueTag: {
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  overdueTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#991B1B",
  },
  lineBadge: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lineBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  lineNote: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});


