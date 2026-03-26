import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScheduleDetailModal } from "../ScheduleDetailModal";
import { useCache } from "../../store/cacheStore";
import { useSettings } from "../../store/settingsStore";
import { LoanSchedule } from "../../types/odoo";
import {
  displayMany2One,
  formatDateLabel,
  formatMoney,
  formatRelativeSyncTime,
  humanizeStatus,
} from "../../utils/format";

function getStatusColor(status: string) {
  switch (status) {
    case "done":
      return { backgroundColor: "#DCFCE7", textColor: "#166534" };
    case "running":
      return { backgroundColor: "#DBEAFE", textColor: "#1D4ED8" };
    case "at_risk":
    case "default":
      return { backgroundColor: "#FEE2E2", textColor: "#991B1B" };
    case "no_valid_plan":
    case "non_communicating":
      return { backgroundColor: "#FFEDD5", textColor: "#9A3412" };
    default:
      return { backgroundColor: "#E5E7EB", textColor: "#374151" };
  }
}

export default function SchedulesScreen() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const {
    schedules,
    isLoaded,
    isOnline,
    refreshingSchedules,
    refreshSchedules,
  } = useCache();
  const [error, setError] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<LoanSchedule | null>(null);

  const configured = useMemo(
    () => !!(settings.baseUrl && settings.db && settings.username && settings.password),
    [settings]
  );

  const loadSchedules = useCallback(async () => {
    if (!configured) {
      return;
    }
    setError(null);
    try {
      await refreshSchedules();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [configured, refreshSchedules]);

  useFocusEffect(
    useCallback(() => {
      if (
        settingsLoaded &&
        isLoaded &&
        configured &&
        isOnline &&
        !schedules.fetchedAt &&
        !refreshingSchedules
      ) {
        loadSchedules();
      }
    }, [
      configured,
      isLoaded,
      isOnline,
      loadSchedules,
      refreshingSchedules,
      schedules.fetchedAt,
      settingsLoaded,
    ])
  );

  if (!settingsLoaded || !isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.helperText}>Loading schedules…</Text>
      </View>
    );
  }

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Configure Odoo first</Text>
        <Text style={styles.emptyText}>
          Save your Odoo connection in Settings so the app can cache payment schedules offline.
        </Text>
      </View>
    );
  }

  const showEmpty = schedules.items.length === 0 && !refreshingSchedules;

  return (
    <>
      <ScheduleDetailModal
        visible={!!selectedSchedule}
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onUpdated={loadSchedules}
      />
      <FlatList
      data={schedules.items}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={[
        styles.listContent,
        showEmpty ? { flexGrow: 1 } : null,
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshingSchedules} onRefresh={loadSchedules} />
      }
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 16 }}>
          <View
            style={[
              styles.banner,
              isOnline ? styles.bannerOnline : styles.bannerOffline,
            ]}
          >
            <Ionicons
              name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
              size={18}
              color={isOnline ? "#166534" : "#92400E"}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {isOnline ? "Schedules synced" : "Offline schedule view"}
              </Text>
              <Text style={styles.bannerText}>
                {isOnline
                  ? "Pull down to refresh payment schedules from Odoo."
                  : "Showing locally cached schedules until the device reconnects."}
              </Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Loan payment schedules</Text>
            <Text style={styles.summaryText}>{formatRelativeSyncTime(schedules.fetchedAt)}</Text>
            <Text style={styles.summaryText}>{schedules.items.length} schedule(s) cached</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!isOnline && schedules.items.length === 0 ? (
              <Text style={styles.warnText}>Connect online once to download schedules.</Text>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centeredInline}>
          <Ionicons name="calendar-outline" size={42} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No schedules found</Text>
          <Text style={styles.emptyText}>
            {isOnline
              ? "No payment schedules were returned from Odoo."
              : "No cached schedules available yet."}
          </Text>
          {isOnline ? (
            <TouchableOpacity style={styles.retryButton} onPress={loadSchedules}>
              <Text style={styles.retryText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item }) => {
        const currency = settings.defaultCurrency || "UGX";
        const badge = getStatusColor(item.management_status);

        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedSchedule(item)}
            activeOpacity={0.85}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleName}>{item.name}</Text>
                <Text style={styles.invoiceText}>
                  Invoice: {displayMany2One(item.invoice_id, "Not linked")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                  <Text style={[styles.badgeText, { color: badge.textColor }]}>
                    {humanizeStatus(item.management_status)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color="#9CA3AF" />
              </View>
            </View>

            <Text style={styles.partnerName}>{displayMany2One(item.partner_id, "No customer")}</Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Invoice Date</Text>
                <Text style={styles.metricValue}>{formatDateLabel(item.invoice_date)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Next Payment</Text>
                <Text style={styles.metricValue}>{formatDateLabel(item.next_payment_date)}</Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Next Single Amount</Text>
                <Text style={styles.metricValue}>
                  {formatMoney(item.next_single_amount, currency)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Next Expected</Text>
                <Text style={styles.metricValue}>
                  {formatMoney(item.next_expected_amount, currency)}
                </Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Due Amount</Text>
                <Text style={styles.metricValue}>{formatMoney(item.due_amount, currency)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Missed Count</Text>
                <Text style={styles.metricValue}>{item.missed_count}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    backgroundColor: "#F9FAFB",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    backgroundColor: "#F9FAFB",
  },
  centeredInline: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  helperText: {
    marginTop: 12,
    color: "#6B7280",
  },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  bannerOnline: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  bannerOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  bannerText: {
    marginTop: 2,
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  summaryText: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 4,
  },
  warnText: {
    color: "#B45309",
    fontSize: 13,
    marginTop: 4,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  scheduleName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  invoiceText: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  partnerName: {
    fontSize: 14,
    color: "#4B5563",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  metricLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});

