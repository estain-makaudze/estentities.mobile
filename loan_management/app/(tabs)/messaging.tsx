import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate } from "../../services/loanApi";
import { fetchPartnerPhone, sendSms } from "../../services/twilioSms";
import { useCache } from "../../store/cacheStore";
import { useSettings } from "../../store/settingsStore";
import { LoanInvoice, OdooSettings } from "../../types/odoo";
import { displayMany2One, formatDateLabel, formatMoney } from "../../utils/format";

// ── Compose Modal ─────────────────────────────────────────────────────────────

function ComposeModal({
  visible,
  invoice,
  settings,
  onClose,
}: {
  visible: boolean;
  invoice: LoanInvoice | null;
  settings: OdooSettings;
  onClose: () => void;
}) {
  const currency =
    invoice && Array.isArray(invoice.currency_id)
      ? invoice.currency_id[1]
      : settings.defaultCurrency || "UGX";

  const defaultMessage = useMemo(() => {
    if (!invoice) return "";
    const partner = Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : "Client";
    const ref = invoice.name || `Invoice #${invoice.id}`;
    const bal = invoice.amount_residual > 0
      ? ` Outstanding balance: ${formatMoney(invoice.amount_residual, currency)}.`
      : "";
    const due = invoice.invoice_date_due
      ? ` Due date: ${formatDateLabel(invoice.invoice_date_due)}.`
      : "";
    return `Dear ${partner}, this is a reminder regarding your loan invoice ${ref}.${due}${bal} Please make your payment at your earliest convenience. Thank you!`;
  }, [invoice, currency]);

  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<"sent" | "failed" | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!visible || !invoice) return;
    if (initialized.current) return;
    initialized.current = true;

    setMessage(defaultMessage);
    setPhone("");
    setLoadError(null);
    setSendResult(null);
    setFailReason(null);

    if (!settings.smsEnabled || !settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioFromNumber) {
      setLoadError("SMS not configured. Enable Twilio SMS in Settings.");
      return;
    }

    const partnerId = Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : null;
    if (!partnerId) return;

    setLoadingPhone(true);
    (async () => {
      try {
        const uid = await authenticate(settings);
        const fetchedPhone = await fetchPartnerPhone(settings, uid, partnerId);
        setPhone(fetchedPhone ?? "");
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingPhone(false);
      }
    })();
  }, [visible, invoice, settings, defaultMessage]);

  const handleClose = () => {
    initialized.current = false;
    setSendResult(null);
    onClose();
  };

  const handleSend = async () => {
    if (!phone.trim()) {
      setLoadError("Enter a recipient phone number.");
      return;
    }
    if (!message.trim()) {
      setLoadError("The message cannot be empty.");
      return;
    }
    setLoadError(null);
    setSending(true);
    setSendResult(null);
    setFailReason(null);
    try {
      await sendSms(
        settings.twilioAccountSid,
        settings.twilioAuthToken,
        settings.twilioFromNumber,
        phone.trim(),
        message.trim()
      );
      setSendResult("sent");
    } catch (e: unknown) {
      setSendResult("failed");
      setFailReason(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composeHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.composeClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.composeTitle}>Compose Message</Text>
          <View style={{ width: 36 }} />
        </View>

        {invoice ? (
          <View style={styles.invoiceRef}>
            <Ionicons name="receipt-outline" size={14} color="#2563EB" />
            <Text style={styles.invoiceRefText} numberOfLines={1}>
              {invoice.name} · {displayMany2One(invoice.partner_id, "Unknown")}
            </Text>
          </View>
        ) : null}

        <FlatList
          keyboardShouldPersistTaps="handled"
          data={[]}
          renderItem={null}
          ListHeaderComponent={
            <View style={{ padding: 16, gap: 14 }}>
              {loadingPhone ? (
                <View style={styles.infoBox}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.infoText}>Looking up phone number…</Text>
                </View>
              ) : null}

              {loadError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                  <Text style={styles.errorText}>{loadError}</Text>
                </View>
              ) : null}

              {sendResult === "sent" ? (
                <View style={styles.sentBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#166534" />
                  <Text style={styles.sentText}>Message sent successfully!</Text>
                </View>
              ) : null}

              {sendResult === "failed" ? (
                <View style={styles.failBox}>
                  <Ionicons name="close-circle" size={20} color="#B91C1C" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.failText}>Failed to send</Text>
                    {failReason ? <Text style={styles.failReason}>{failReason}</Text> : null}
                  </View>
                </View>
              ) : null}

              <View>
                <Text style={styles.fieldLabel}>Recipient Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+256700000000"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Message (tap to edit)</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={7}
                  textAlignVertical="top"
                  placeholder="Type your message…"
                />
                <Text style={styles.charCount}>{message.length} characters</Text>
              </View>

              {sendResult !== "sent" ? (
                <TouchableOpacity
                  style={[styles.sendBtn, (sending || !!loadError) && { opacity: 0.7 }]}
                  onPress={handleSend}
                  disabled={sending || !!loadError}
                  activeOpacity={0.8}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.sendBtnText}>Send Message</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.8}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MessagingScreen() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const { invoices, isLoaded, isOnline } = useCache();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<LoanInvoice | null>(null);

  const configured = useMemo(
    () => !!(settings.baseUrl && settings.db && settings.username && settings.password),
    [settings]
  );

  // Filter invoices for messaging (unpaid by default, search by customer or invoice)
  const filteredInvoices = useMemo(() => {
    let list = invoices.items.filter((inv) => inv.payment_state !== "paid");
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (inv) =>
          (inv.name && inv.name.toLowerCase().includes(q)) ||
          (Array.isArray(inv.partner_id) && inv.partner_id[1].toLowerCase().includes(q))
      );
    }
    return list;
  }, [invoices.items, searchQuery]);

  if (!settingsLoaded || !isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!configured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Configure Odoo first</Text>
        <Text style={styles.emptyText}>
          Open Settings and enter your Odoo credentials.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ComposeModal
        visible={!!selectedInvoice}
        invoice={selectedInvoice}
        settings={settings}
        onClose={() => setSelectedInvoice(null)}
      />

      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.listContent,
          filteredInvoices.length === 0 ? { flexGrow: 1 } : null,
        ]}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 12 }}>
            <View style={styles.pageHeader}>
              <View>
                <Text style={styles.pageTitle}>Message Clients</Text>
                <Text style={styles.pageSubtitle}>
                  Select an invoice to send a payment reminder
                </Text>
              </View>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? "#22C55E" : "#F59E0B" }]} />
            </View>

            {!settings.smsEnabled ? (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color="#92400E" />
                <Text style={styles.warningText}>
                  SMS is disabled. Enable Twilio in Settings to send messages.
                </Text>
              </View>
            ) : null}

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by invoice # or customer…"
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

            <Text style={styles.hintText}>
              Showing {filteredInvoices.length} unpaid invoice{filteredInvoices.length !== 1 ? "s" : ""}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No invoices found</Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "No invoices match your search."
                : invoices.items.length === 0
                ? "Pull to refresh the invoices first."
                : "All invoices are paid — no reminders needed!"}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const cur =
            Array.isArray(item.currency_id)
              ? item.currency_id[1]
              : settings.defaultCurrency || "UGX";

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setSelectedInvoice(item)}
              activeOpacity={0.82}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceName} numberOfLines={1}>
                    {item.name || `Invoice #${item.id}`}
                  </Text>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {displayMany2One(item.partner_id, "No customer")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={styles.balanceText}>
                    {formatMoney(item.amount_residual, cur)}
                  </Text>
                  <View style={styles.composePill}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color="#0F766E" />
                    <Text style={styles.composePillText}>Message</Text>
                  </View>
                </View>
              </View>
              {item.invoice_date_due ? (
                <Text style={styles.dueDateText}>
                  Due {formatDateLabel(item.invoice_date_due)}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  loadingText: {
    marginTop: 12,
    color: "#6B7280",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
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
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
  },
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
  hintText: {
    fontSize: 12,
    color: "#6B7280",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  invoiceName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  customerName: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 2,
  },
  balanceText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B91C1C",
  },
  composePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDFA",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  composePillText: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: "700",
  },
  dueDateText: {
    fontSize: 12,
    color: "#9CA3AF",
  },

  // Compose modal
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  composeClose: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  composeTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  invoiceRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
  },
  invoiceRefText: {
    flex: 1,
    fontSize: 13,
    color: "#1D4ED8",
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#2563EB",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 14,
  },
  sentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  sentText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
  },
  failBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  failText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "700",
  },
  failReason: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  inputMulti: {
    minHeight: 150,
    textAlignVertical: "top",
    lineHeight: 22,
  },
  charCount: {
    marginTop: 4,
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0F766E",
    paddingVertical: 14,
    borderRadius: 12,
  },
  sendBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  doneBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  doneBtnText: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 16,
  },
});
