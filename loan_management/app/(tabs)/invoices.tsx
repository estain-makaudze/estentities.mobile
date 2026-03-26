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
import { InvoiceDetailModal } from "../InvoiceDetailModal";
import { ScheduleDetailModal } from "../ScheduleDetailModal";
import { useCache } from "../../store/cacheStore";
import { useSettings } from "../../store/settingsStore";
import { LoanInvoice, LoanSchedule } from "../../types/odoo";
import {
  displayMany2One,
  formatDateLabel,
  formatMoney,
  formatRelativeSyncTime,
  humanizeStatus,
} from "../../utils/format";

function getPaymentBadgeColor(paymentState: string) {
  switch (paymentState) {
    case "paid":
      return { backgroundColor: "#DCFCE7", textColor: "#166534" };
    case "partial":
    case "in_payment":
      return { backgroundColor: "#FEF3C7", textColor: "#92400E" };
    default:
      return { backgroundColor: "#DBEAFE", textColor: "#1D4ED8" };
  }
}

function getManagementBadgeColor(status?: string | false | null) {
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
      return { backgroundColor: "#E0E7FF", textColor: "#3730A3" };
  }
}

export default function InvoicesScreen() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const {
    invoices,
    schedules,
    isLoaded,
    isOnline,
    refreshingInvoices,
    refreshInvoices,
    refreshSchedules,
  } = useCache();
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<LoanInvoice | null>(null);
  const [scheduleForModal, setScheduleForModal] = useState<LoanSchedule | null>(null);

  const configured = useMemo(
    () => !!(settings.baseUrl && settings.db && settings.username && settings.password),
    [settings]
  );

  const loadInvoices = useCallback(async () => {
    if (!configured) return;
    setError(null);
    try {
      await refreshInvoices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [configured, refreshInvoices]);

  useFocusEffect(
    useCallback(() => {
      if (
        settingsLoaded &&
        isLoaded &&
        configured &&
        isOnline &&
        !invoices.fetchedAt &&
        !refreshingInvoices
      ) {
        loadInvoices();
      }
    }, [
      configured,
      invoices.fetchedAt,
      isLoaded,
      isOnline,
      loadInvoices,
      refreshingInvoices,
      settingsLoaded,
    ])
  );

  // Find the linked schedule for a given invoice from the cache
  const findLinkedSchedule = useCallback(
    (invoiceId: number): LoanSchedule | null =>
      schedules.items.find(
        (s) => Array.isArray(s.invoice_id) && s.invoice_id[0] === invoiceId
      ) ?? null,
    [schedules.items]
  );

  if (!settingsLoaded || !isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.helperText}>Loading invoices…</Text>
      </View>
    );
  }

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Configure Odoo first</Text>
        <Text style={styles.emptyText}>
          Open the Settings tab and enter the Odoo server, database, username and password.
        </Text>
      </View>
    );
  }

  const showEmpty = invoices.items.length === 0 && !refreshingInvoices;

  return (
    <>
      {/* Invoice detail modal */}
      <InvoiceDetailModal
        visible={!!selectedInvoice}
        invoice={selectedInvoice}
        linkedSchedule={selectedInvoice ? findLinkedSchedule(selectedInvoice.id) : null}
        onClose={() => setSelectedInvoice(null)}
        onOpenSchedule={(sch) => setScheduleForModal(sch)}
      />
      {/* Schedule management modal — slides on top of invoice modal */}
      <ScheduleDetailModal
        visible={!!scheduleForModal}
        schedule={scheduleForModal}
        onClose={() => setScheduleForModal(null)}
        onUpdated={async () => {
          try { await refreshSchedules(); } catch { /* silent */ }
        }}
      />

      <FlatList
        data={invoices.items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.listContent,
          showEmpty ? { flexGrow: 1 } : null,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshingInvoices} onRefresh={loadInvoices} />
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
                  {isOnline ? "Online" : "Offline mode"}
                </Text>
                <Text style={styles.bannerText}>
                  {isOnline
                    ? "Pull down to refresh. Tap any invoice to view payments."
                    : "Showing cached invoices. Connect to sync fresh data."}
                </Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Loan invoices</Text>
              <Text style={styles.summaryText}>{formatRelativeSyncTime(invoices.fetchedAt)}</Text>
              <Text style={styles.summaryText}>{invoices.items.length} invoice(s) cached</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {!isOnline && invoices.items.length === 0 ? (
                <Text style={styles.warnText}>Connect online at least once to download invoices.</Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centeredInline}>
            <Ionicons name="receipt-outline" size={42} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No invoices found</Text>
            <Text style={styles.emptyText}>
              {isOnline
                ? "No customer invoices were returned from Odoo."
                : "No cached invoices available yet."}
            </Text>
            {isOnline ? (
              <TouchableOpacity style={styles.retryButton} onPress={loadInvoices}>
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const currency =
            Array.isArray(item.currency_id) && item.currency_id
              ? (item.currency_id as [number, string])[1]
              : settings.defaultCurrency || "UGX";
          const paymentBadge = getPaymentBadgeColor(item.payment_state);
          const managementBadge = getManagementBadgeColor(item.loan_management_status);
          const hasLinkedSchedule = !!findLinkedSchedule(item.id);

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setSelectedInvoice(item)}
              activeOpacity={0.82}
            >
              {/* Row 1: invoice number + status badges + chevron */}
              <View style={styles.cardRow1}>
                <Text style={styles.invoiceNumber} numberOfLines={1}>
                  {item.name || `Invoice #${item.id}`}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={[styles.badge, { backgroundColor: paymentBadge.backgroundColor }]}>
                    <Text style={[styles.badgeText, { color: paymentBadge.textColor }]}>
                      {humanizeStatus(item.payment_state)}
                    </Text>
                  </View>
                  {item.loan_management_status ? (
                    <View style={[styles.badge, { backgroundColor: managementBadge.backgroundColor }]}>
                      <Text style={[styles.badgeText, { color: managementBadge.textColor }]}>
                        {humanizeStatus(item.loan_management_status)}
                      </Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward-outline" size={15} color="#9CA3AF" />
                </View>
              </View>

              {/* Row 2: customer + total amount */}
              <View style={styles.cardRow2}>
                <Text style={styles.partnerName} numberOfLines={1}>
                  {displayMany2One(item.partner_id, "No customer")}
                </Text>
                <Text style={styles.amountTotal}>{formatMoney(item.amount_total, currency)}</Text>
              </View>

              {/* Row 3: dates + residual + schedule indicator */}
              <View style={styles.cardRow3}>
                <Text style={styles.dateText}>
                  {formatDateLabel(item.invoice_date)}
                  {item.invoice_date_due ? ` · Due ${formatDateLabel(item.invoice_date_due)}` : ""}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {item.amount_residual > 0 ? (
                    <Text style={styles.residualText}>
                      Bal: {formatMoney(item.amount_residual, currency)}
                    </Text>
                  ) : null}
                  {hasLinkedSchedule ? (
                    <View style={styles.schedulePill}>
                      <Ionicons name="calendar-outline" size={10} color="#0369A1" />
                      <Text style={styles.schedulePillText}>Schedule</Text>
                    </View>
                  ) : null}
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
  // ── Compact card ──────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 7,
  },
  cardRow1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  invoiceNumber: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  partnerName: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
  },
  amountTotal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2563EB",
  },
  cardRow3: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 12,
    color: "#9CA3AF",
  },
  residualText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "600",
  },
  schedulePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E0F2FE",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  schedulePillText: {
    fontSize: 10,
    color: "#0369A1",
    fontWeight: "700",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});

