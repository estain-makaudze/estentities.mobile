import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return schedules.items;
    const q = searchQuery.trim().toLowerCase();
    return schedules.items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (Array.isArray(s.partner_id) && s.partner_id[1].toLowerCase().includes(q)) ||
        (Array.isArray(s.invoice_id) && s.invoice_id[1].toLowerCase().includes(q))
    );
  }, [schedules.items, searchQuery]);

  return (
    <>
      <ScheduleDetailModal
        visible={!!selectedSchedule}
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onUpdated={loadSchedules}
      />
      <FlatList
      data={filteredSchedules}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={[
        styles.listContent,
        showEmpty ? { flexGrow: 1 } : null,
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshingSchedules} onRefresh={loadSchedules} />
      }
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 12 }}>
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

          {/* Search bar */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, customer or invoice…"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>

          {filteredSchedules.length > 0 && searchQuery ? (
            <Text style={styles.resultCount}>
              {filteredSchedules.length} of {schedules.items.length} schedules
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centeredInline}>
          <Ionicons name="calendar-outline" size={42} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No schedules found</Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? "No schedules match your search."
              : isOnline
              ? "No payment schedules were returned from Odoo."
              : "No cached schedules available yet."}
          </Text>
          {isOnline && !searchQuery ? (
            <TouchableOpacity style={styles.retryButton} onPress={loadSchedules}>
              <Text style={styles.retryText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => {
        const currency = settings.defaultCurrency || "UGX";
        const badge = getStatusColor(item.management_status);

        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedSchedule(item)}
            activeOpacity={0.85}
          >
            {/* Row 1: name + status badge + chevron */}
            <View style={styles.cardRow1}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.partnerName} numberOfLines={1}>
                  {displayMany2One(item.partner_id, "No customer")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                  <Text style={[styles.badgeText, { color: badge.textColor }]}>
                    {humanizeStatus(item.management_status)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color="#9CA3AF" />
              </View>
            </View>

            {/* Row 2: compact metrics inline */}
            <View style={styles.cardRow2}>
              <View style={styles.metricInline}>
                <Ionicons name="calendar-outline" size={12} color="#6B7280" />
                <Text style={styles.metricLabel}>Next</Text>
                <Text style={styles.metricValue}>{formatDateLabel(item.next_payment_date)}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricInline}>
                <Ionicons name="cash-outline" size={12} color="#6B7280" />
                <Text style={styles.metricLabel}>Due</Text>
                <Text style={styles.metricValue}>{formatMoney(item.due_amount, currency)}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricInline}>
                <Ionicons name="alert-outline" size={12} color="#6B7280" />
                <Text style={styles.metricLabel}>Missed</Text>
                <Text style={[styles.metricValue, item.missed_count > 0 && { color: "#B91C1C" }]}>
                  {item.missed_count}
                </Text>
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  cardRow1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  scheduleName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  partnerName: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 1,
  },
  cardRow2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#E5E7EB",
  },
  metricLabel: {
    fontSize: 11,
    color: "#6B7280",
  },
  metricValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  // Search
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    padding: 0,
  },
  resultCount: {
    fontSize: 12,
    color: "#6B7280",
  },
});

