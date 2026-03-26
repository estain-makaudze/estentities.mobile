import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, fetchScheduleLinesByInvoiceId } from "../services/loanApi";
import { useSettings } from "../store/settingsStore";
import { LoanInvoice, LoanSchedule, LoanScheduleLine } from "../types/odoo";
import { displayMany2One, formatDateLabel, formatMoney, humanizeStatus } from "../utils/format";

// ── Badge helpers ─────────────────────────────────────────────────────────────

function getPaymentStateBadge(paymentState: string) {
  switch (paymentState) {
    case "paid":
      return { bg: "#DCFCE7", color: "#166534" };
    case "partial":
    case "in_payment":
      return { bg: "#FEF3C7", color: "#92400E" };
    default:
      return { bg: "#DBEAFE", color: "#1D4ED8" };
  }
}

function getManagementBadge(status?: string | false | null) {
  switch (status) {
    case "done":             return { bg: "#DCFCE7", color: "#166534" };
    case "running":          return { bg: "#DBEAFE", color: "#1D4ED8" };
    case "at_risk":          return { bg: "#FEE2E2", color: "#991B1B" };
    case "no_valid_plan":
    case "non_communicating":return { bg: "#FFEDD5", color: "#9A3412" };
    default:                 return { bg: "#E5E7EB", color: "#374151" };
  }
}

function getLineStateBadge(state: string) {
  switch (state) {
    case "paid":     return { bg: "#DCFCE7", color: "#166534", label: "Paid" };
    case "missed":   return { bg: "#FEE2E2", color: "#991B1B", label: "Missed" };
    case "canceled": return { bg: "#F3F4F6", color: "#6B7280", label: "Canceled" };
    default:         return { bg: "#DBEAFE", color: "#1D4ED8", label: "Unpaid" };
  }
}

// ── Payment Line Row ──────────────────────────────────────────────────────────

function PaymentLineRow({ line, currency }: { line: LoanScheduleLine; currency: string }) {
  const badge = getLineStateBadge(line.state);
  const isRescheduled =
    typeof line.note === "string" && line.note.toLowerCase().includes("reschedul");

  return (
    <View style={lineS.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={lineS.date}>{formatDateLabel(line.payment_date)}</Text>
        {line.note ? (
          <Text style={lineS.note} numberOfLines={2}>
            {line.note}
          </Text>
        ) : null}
        {line.paid_date ? (
          <Text style={lineS.paidDate}>Paid {formatDateLabel(line.paid_date)}</Text>
        ) : null}
        {isRescheduled && (
          <View style={lineS.rescheduledPill}>
            <Ionicons name="repeat-outline" size={9} color="#0369A1" />
            <Text style={lineS.rescheduledText}>Rescheduled</Text>
          </View>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Text style={lineS.amount}>{formatMoney(line.expected_amount, currency)}</Text>
        <View style={[lineS.badge, { backgroundColor: badge.bg }]}>
          <Text style={[lineS.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  invoice: LoanInvoice | null;
  linkedSchedule: LoanSchedule | null;
  onClose: () => void;
  onOpenSchedule: (schedule: LoanSchedule) => void;
}

export function InvoiceDetailModal({
  visible,
  invoice,
  linkedSchedule,
  onClose,
  onOpenSchedule,
}: Props) {
  const { settings } = useSettings();
  const [lines, setLines] = useState<LoanScheduleLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency =
    Array.isArray(invoice?.currency_id) && invoice!.currency_id
      ? (invoice!.currency_id as [number, string])[1]
      : settings.defaultCurrency || "UGX";

  const loadLines = useCallback(async () => {
    if (!invoice) return;
    setLoading(true);
    setError(null);
    try {
      const uid = await authenticate(settings);
      const fetched = await fetchScheduleLinesByInvoiceId(settings, uid, invoice.id);
      setLines(fetched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [invoice, settings]);

  useEffect(() => {
    if (visible && invoice) {
      loadLines();
    } else {
      setLines([]);
      setError(null);
    }
  }, [visible, invoice, loadLines]);

  if (!invoice) return null;

  const payBadge = getPaymentStateBadge(invoice.payment_state);
  const mgmtBadge = getManagementBadge(invoice.loan_management_status);

  const paidCount   = lines.filter((l) => l.state === "paid").length;
  const missedCount = lines.filter((l) => l.state === "missed").length;
  const unpaidCount = lines.filter((l) => l.state === "unpaid").length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {invoice.name || `Invoice #${invoice.id}`}
            </Text>
            <Text style={s.headerSub} numberOfLines={1}>
              {displayMany2One(invoice.partner_id, "No customer")}
            </Text>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Invoice Status</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View style={[s.badge, { backgroundColor: payBadge.bg }]}>
                <Text style={[s.badgeText, { color: payBadge.color }]}>
                  {humanizeStatus(invoice.payment_state)}
                </Text>
              </View>
              {invoice.loan_management_status ? (
                <View style={[s.badge, { backgroundColor: mgmtBadge.bg }]}>
                  <Text style={[s.badgeText, { color: mgmtBadge.color }]}>
                    {humanizeStatus(invoice.loan_management_status)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={s.infoGrid}>
              <View style={s.infoCell}>
                <Text style={s.infoLabel}>Invoice Date</Text>
                <Text style={s.infoValue}>{formatDateLabel(invoice.invoice_date)}</Text>
              </View>
              <View style={s.infoCell}>
                <Text style={s.infoLabel}>Due Date</Text>
                <Text style={s.infoValue}>{formatDateLabel(invoice.invoice_date_due)}</Text>
              </View>
            </View>
          </View>

          {/* Amounts */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Amounts</Text>
            <View style={s.amountGrid}>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Total</Text>
                <Text style={s.amountValue}>{formatMoney(invoice.amount_total, currency)}</Text>
              </View>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Outstanding</Text>
                <Text style={[s.amountValue, invoice.amount_residual > 0 && { color: "#B91C1C" }]}>
                  {formatMoney(invoice.amount_residual, currency)}
                </Text>
              </View>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Overdue</Text>
                <Text style={[s.amountValue, invoice.loan_due_amount > 0 && { color: "#B91C1C" }]}>
                  {formatMoney(invoice.loan_due_amount, currency)}
                </Text>
              </View>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Next Expected</Text>
                <Text style={s.amountValue}>
                  {formatMoney(invoice.loan_next_expected_amount, currency)}
                </Text>
              </View>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Next Single</Text>
                <Text style={s.amountValue}>
                  {formatMoney(invoice.loan_next_single_amount, currency)}
                </Text>
              </View>
              <View style={s.amountCell}>
                <Text style={s.amountLabel}>Next Payment</Text>
                <Text style={s.amountValue}>
                  {formatDateLabel(invoice.loan_next_payment_date)}
                </Text>
              </View>
            </View>
          </View>

          {/* Payment Plan Lines */}
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Payment Plan</Text>
              {lines.length > 0 && (
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {paidCount > 0 && (
                    <View style={[s.miniPill, { backgroundColor: "#DCFCE7" }]}>
                      <Text style={[s.miniPillText, { color: "#166534" }]}>{paidCount} paid</Text>
                    </View>
                  )}
                  {missedCount > 0 && (
                    <View style={[s.miniPill, { backgroundColor: "#FEE2E2" }]}>
                      <Text style={[s.miniPillText, { color: "#991B1B" }]}>{missedCount} missed</Text>
                    </View>
                  )}
                  {unpaidCount > 0 && (
                    <View style={[s.miniPill, { backgroundColor: "#DBEAFE" }]}>
                      <Text style={[s.miniPillText, { color: "#1D4ED8" }]}>{unpaidCount} open</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {loading && (
              <View style={s.loaderRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={s.loaderText}>Loading payment lines…</Text>
              </View>
            )}

            {error && !loading && (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#B91C1C" />
                <Text style={s.errorText}>{error}</Text>
                <TouchableOpacity onPress={loadLines}>
                  <Text style={s.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !error && lines.length === 0 && (
              <View style={s.emptyLines}>
                <Ionicons name="calendar-outline" size={30} color="#D1D5DB" />
                <Text style={s.emptyLinesText}>No payment schedule linked.</Text>
              </View>
            )}

            {lines.map((line) => (
              <PaymentLineRow key={line.id} line={line} currency={currency} />
            ))}
          </View>

          {/* Manage Schedule button */}
          {linkedSchedule ? (
            <TouchableOpacity
              style={s.manageBtn}
              onPress={() => onOpenSchedule(linkedSchedule)}
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              <Text style={s.manageBtnText}>Manage Payment Schedule</Text>
              <Ionicons name="arrow-forward-outline" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  headerSub: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
  },
  infoCell: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    gap: 3,
  },
  infoLabel: { fontSize: 11, color: "#6B7280" },
  infoValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  amountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amountCell: {
    width: "47%",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    gap: 4,
  },
  amountLabel: { fontSize: 11, color: "#6B7280" },
  amountValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  miniPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  miniPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    justifyContent: "center",
  },
  loaderText: {
    color: "#6B7280",
    fontSize: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#B91C1C",
  },
  retryText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyLines: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyLinesText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    padding: 16,
  },
  manageBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
});

const lineS = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  date: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  note: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },
  paidDate: {
    fontSize: 12,
    color: "#166534",
  },
  rescheduledPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E0F2FE",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  rescheduledText: {
    fontSize: 10,
    color: "#0369A1",
    fontWeight: "700",
  },
  amount: {
    fontSize: 14,
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
});

