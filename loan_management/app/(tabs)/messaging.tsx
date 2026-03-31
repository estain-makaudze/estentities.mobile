import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, postMessageToOdoo } from "../../services/loanApi";
import { fetchPartnerPhone, sendSms } from "../../services/twilioSms";
import { useCache } from "../../store/cacheStore";
import { useMessages } from "../../store/messageStore";
import { useSettings } from "../../store/settingsStore";
import { LoanInvoice, OdooSettings } from "../../types/odoo";
import { displayMany2One, formatDateLabel, formatMoney } from "../../utils/format";

// ── Helpers ────────────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "unpaid" | "paid" | "overdue";

function todayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function getInvoiceStatus(inv: LoanInvoice): StatusFilter {
  if (inv.payment_state === "paid" || inv.payment_state === "in_payment") return "paid";
  if (inv.invoice_date_due && inv.invoice_date_due < todayStr()) return "overdue";
  return "unpaid";
}

function statusFilterLabel(f: StatusFilter): string {
  switch (f) {
    case "all":     return "All";
    case "unpaid":  return "Unpaid";
    case "paid":    return "Paid";
    case "overdue": return "Overdue";
  }
}

// ── Compose Modal (single invoice) ────────────────────────────────────────────────────────────

function ComposeModal({
  visible,
  invoice,
  settings,
  onClose,
  onSent,
}: {
  visible: boolean;
  invoice: LoanInvoice | null;
  settings: OdooSettings;
  onClose: () => void;
  onSent: (recipientName: string, recipientPhone: string, message: string, invoiceId: number, invoiceName: string) => void;
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
    if (!phone.trim()) { setLoadError("Enter a recipient phone number."); return; }
    if (!message.trim()) { setLoadError("The message cannot be empty."); return; }
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
      const partnerName = invoice && Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : "Client";
      onSent(partnerName, phone.trim(), message.trim(), invoice?.id ?? 0, invoice?.name ?? "");
      if (invoice?.id) {
        try {
          const uid = await authenticate(settings);
          await postMessageToOdoo(settings, uid, invoice.id, `[SMS sent to ${phone.trim()}] ${message.trim()}`);
        } catch { /* ignore chatter errors */ }
      }
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

// ── Broadcast Modal ───────────────────────────────────────────────────────────────────────────────

function BroadcastModal({
  visible,
  invoices,
  settings,
  onClose,
  onSent,
}: {
  visible: boolean;
  invoices: LoanInvoice[];
  settings: OdooSettings;
  onClose: () => void;
  onSent: (entries: { recipientName: string; recipientPhone: string; message: string; invoiceId: number; invoiceName: string }[]) => void;
}) {
  const [message, setMessage] = useState(
    "Dear [client], this is a reminder regarding your outstanding loan payment. Please make your payment at your earliest convenience. Thank you!"
  );
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failures: number } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setMessage("Dear [client], this is a reminder regarding your outstanding loan payment. Please make your payment at your earliest convenience. Thank you!");
      setSending(false);
      setProgress(null);
      setDone(false);
      setError(null);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!message.trim()) { setError("Message cannot be empty."); return; }
    if (!settings.smsEnabled || !settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioFromNumber) {
      setError("SMS not configured. Enable Twilio SMS in Settings.");
      return;
    }
    setError(null);
    setSending(true);
    setProgress({ done: 0, total: invoices.length, failures: 0 });
    const sentEntries: { recipientName: string; recipientPhone: string; message: string; invoiceId: number; invoiceName: string }[] = [];
    let failures = 0;
    try {
      const uid = await authenticate(settings);
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        const partnerName = Array.isArray(inv.partner_id) ? inv.partner_id[1] : "Client";
        const partnerId = Array.isArray(inv.partner_id) ? inv.partner_id[0] : null;
        const personalised = message.replace(/\[client\]/gi, partnerName);
        if (!partnerId) { failures++; setProgress({ done: i + 1, total: invoices.length, failures }); continue; }
        try {
          const phone = await fetchPartnerPhone(settings, uid, partnerId);
          if (!phone) { failures++; setProgress({ done: i + 1, total: invoices.length, failures }); continue; }
          await sendSms(settings.twilioAccountSid, settings.twilioAuthToken, settings.twilioFromNumber, phone, personalised);
          sentEntries.push({ recipientName: partnerName, recipientPhone: phone, message: personalised, invoiceId: inv.id, invoiceName: inv.name });
          postMessageToOdoo(settings, uid, inv.id, `[Broadcast SMS to ${phone}] ${personalised}`).catch(() => {});
        } catch {
          failures++;
        }
        setProgress({ done: i + 1, total: invoices.length, failures });
      }
      setDone(true);
      onSent(sentEntries);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composeHeader}>
          <TouchableOpacity onPress={onClose} style={styles.composeClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.composeTitle}>Broadcast Message</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.invoiceRef}>
          <Ionicons name="people-outline" size={14} color="#2563EB" />
          <Text style={styles.invoiceRefText} numberOfLines={1}>
            {invoices.length} recipient{invoices.length !== 1 ? "s" : ""} selected
          </Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.infoBox, { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }]}>
            <Ionicons name="information-circle-outline" size={16} color="#92400E" />
            <Text style={[styles.infoText, { color: "#92400E", flex: 1 }]}>
              Use <Text style={{ fontWeight: "700" }}>[client]</Text> as a placeholder — it will be replaced with each recipient&apos;s name.
            </Text>
          </View>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {progress ? (
            <View style={styles.sentBox}>
              <Ionicons name={done ? "checkmark-circle" : "hourglass-outline"} size={20} color="#166534" />
              <Text style={styles.sentText}>
                {done
                  ? `Done — sent ${progress.done - progress.failures} of ${progress.total}`
                  : `Sending ${progress.done} / ${progress.total}…`}
                {progress.failures > 0 ? ` (${progress.failures} failed)` : ""}
              </Text>
            </View>
          ) : null}
          {!done ? (
            <>
              <View>
                <Text style={styles.fieldLabel}>Message Template (tap to edit)</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={7}
                  textAlignVertical="top"
                  placeholder="Type your broadcast message…"
                  editable={!sending}
                />
                <Text style={styles.charCount}>{message.length} characters</Text>
              </View>
              <View>
                <Text style={styles.fieldLabel}>Recipients</Text>
                {invoices.slice(0, 5).map((inv) => (
                  <Text key={inv.id} style={styles.recipientItem} numberOfLines={1}>
                    · {displayMany2One(inv.partner_id, "Unknown")} ({inv.name})
                  </Text>
                ))}
                {invoices.length > 5 ? (
                  <Text style={styles.recipientMore}>… and {invoices.length - 5} more</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, sending && { opacity: 0.7 }]}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.sendBtnText}>Send to {invoices.length} recipient{invoices.length !== 1 ? "s" : ""}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Message Box Modal ────────────────────────────────────────────────────────────────────────────

function MessageBoxModal({
  visible,
  onClose,
  onRetry,
}: {
  visible: boolean;
  onClose: () => void;
  onRetry: (msgId: string) => void;
}) {
  const { messages, removeMessage } = useMessages();
  const sorted = useMemo(() => [...messages].sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [messages]);

  function statusColor(s: string): string {
    if (s === "delivered") return "#166534";
    if (s === "failed")    return "#B91C1C";
    if (s === "pending")   return "#92400E";
    return "#374151";
  }

  function statusBg(s: string): string {
    if (s === "delivered") return "#DCFCE7";
    if (s === "failed")    return "#FEE2E2";
    if (s === "pending")   return "#FFFBEB";
    return "#F3F4F6";
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.composeHeader}>
        <TouchableOpacity onPress={onClose} style={styles.composeClose}>
          <Ionicons name="close" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.composeTitle}>Message Box</Text>
        <View style={{ width: 36 }} />
      </View>
      {sorted.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="mail-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No sent messages</Text>
          <Text style={styles.emptyText}>Messages you send will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={msgBox.card}>
              <View style={msgBox.row}>
                <View style={{ flex: 1 }}>
                  <Text style={msgBox.recipient} numberOfLines={1}>
                    {item.recipientName}
                    {item.invoiceName ? ` · ${item.invoiceName}` : ""}
                  </Text>
                  <Text style={msgBox.phone} numberOfLines={1}>{item.recipientPhone}</Text>
                </View>
                <View style={[msgBox.statusBadge, { backgroundColor: statusBg(item.deliveryStatus) }]}>
                  <Text style={[msgBox.statusText, { color: statusColor(item.deliveryStatus) }]}>
                    {item.deliveryStatus}
                  </Text>
                </View>
              </View>
              <Text style={msgBox.preview} numberOfLines={2}>{item.messageContent}</Text>
              <View style={msgBox.footer}>
                <Text style={msgBox.timestamp}>
                  {new Date(item.sentAt).toLocaleString()}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {item.deliveryStatus === "failed" ? (
                    <TouchableOpacity style={msgBox.retryBtn} onPress={() => onRetry(item.id)}>
                      <Ionicons name="refresh-outline" size={13} color="#B91C1C" />
                      <Text style={msgBox.retryText}>Retry</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => removeMessage(item.id)}>
                    <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────

export default function MessagingScreen() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const { invoices, isLoaded, isOnline } = useCache();
  const { addMessage, updateMessageStatus, messages } = useMessages();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<LoanInvoice | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showMessageBox, setShowMessageBox] = useState(false);

  const configured = useMemo(
    () => !!(settings.baseUrl && settings.db && settings.username && settings.password),
    [settings]
  );

  const filteredInvoices = useMemo(() => {
    let list = invoices.items;
    if (statusFilter !== "all") {
      const today = todayStr();
      list = list.filter((inv) => {
        if (statusFilter === "paid") return inv.payment_state === "paid" || inv.payment_state === "in_payment";
        if (statusFilter === "overdue") return !(inv.payment_state === "paid" || inv.payment_state === "in_payment") && !!inv.invoice_date_due && inv.invoice_date_due < today;
        if (statusFilter === "unpaid") return !(inv.payment_state === "paid" || inv.payment_state === "in_payment");
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (inv) =>
          (inv.name && inv.name.toLowerCase().includes(q)) ||
          (Array.isArray(inv.partner_id) && inv.partner_id[1].toLowerCase().includes(q))
      );
    }
    return list;
  }, [invoices.items, searchQuery, statusFilter]);

  const selectedInvoices = useMemo(
    () => filteredInvoices.filter((inv) => selectedIds.has(inv.id)),
    [filteredInvoices, selectedIds]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleEnterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); };
  const handleExitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const handleSelectAll = () => setSelectedIds(new Set(filteredInvoices.map((i) => i.id)));

  const handleSent = useCallback(
    async (recipientName: string, recipientPhone: string, messageContent: string, invoiceId: number, invoiceName: string) => {
      await addMessage({
        invoiceId,
        invoiceName,
        scheduleLineId: null,
        recipientName,
        recipientPhone,
        messageContent,
        messageType: "general",
        deliveryStatus: "sent",
        twilioSid: null,
        errorMessage: null,
      });
    },
    [addMessage]
  );

  const handleBroadcastSent = useCallback(
    async (entries: { recipientName: string; recipientPhone: string; message: string; invoiceId: number; invoiceName: string }[]) => {
      for (const e of entries) {
        await addMessage({
          invoiceId: e.invoiceId,
          invoiceName: e.invoiceName,
          scheduleLineId: null,
          recipientName: e.recipientName,
          recipientPhone: e.recipientPhone,
          messageContent: e.message,
          messageType: "broadcast",
          deliveryStatus: "sent",
          twilioSid: null,
          errorMessage: null,
        });
      }
      setSelectMode(false);
      setSelectedIds(new Set());
    },
    [addMessage]
  );

  const handleRetry = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) {
      Alert.alert("Message not found", "This message may have been deleted.");
      return;
    }
    if (!settings.smsEnabled || !settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioFromNumber) {
      Alert.alert("SMS not configured", "Enable Twilio SMS in Settings.");
      return;
    }
    await updateMessageStatus(msgId, "pending");
    try {
      await sendSms(settings.twilioAccountSid, settings.twilioAuthToken, settings.twilioFromNumber, msg.recipientPhone, msg.messageContent);
      await updateMessageStatus(msgId, "sent");
    } catch (e: unknown) {
      await updateMessageStatus(msgId, "failed", e instanceof Error ? e.message : String(e));
    }
  }, [messages, settings, updateMessageStatus]);

  const unreadFailed = useMemo(() => messages.filter((m) => m.deliveryStatus === "failed").length, [messages]);

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
        <Text style={styles.emptyText}>Open Settings and enter your Odoo credentials.</Text>
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
        onSent={handleSent}
      />
      <BroadcastModal
        visible={showBroadcast}
        invoices={selectedInvoices}
        settings={settings}
        onClose={() => setShowBroadcast(false)}
        onSent={handleBroadcastSent}
      />
      <MessageBoxModal
        visible={showMessageBox}
        onClose={() => setShowMessageBox(false)}
        onRetry={handleRetry}
      />

      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.listContent,
          filteredInvoices.length === 0 ? { flexGrow: 1 } : null,
        ]}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 10 }}>
            <View style={styles.pageHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pageTitle}>Message Clients</Text>
                <Text style={styles.pageSubtitle}>
                  {invoices.items.length} total invoice{invoices.items.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <TouchableOpacity style={styles.msgBoxBtn} onPress={() => setShowMessageBox(true)}>
                  <Ionicons name="mail-outline" size={16} color="#2563EB" />
                  {unreadFailed > 0 ? (
                    <View style={styles.failedBadge}>
                      <Text style={styles.failedBadgeText}>{unreadFailed}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                <View style={[styles.onlineDot, { backgroundColor: isOnline ? "#22C55E" : "#F59E0B" }]} />
              </View>
            </View>

            {!settings.smsEnabled ? (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color="#92400E" />
                <Text style={styles.warningText}>SMS is disabled. Enable Twilio in Settings to send messages.</Text>
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(["all", "unpaid", "overdue", "paid"] as StatusFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
                    {statusFilterLabel(f)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {!selectMode ? (
              <TouchableOpacity style={styles.broadcastBtn} onPress={handleEnterSelectMode}>
                <Ionicons name="checkbox-outline" size={15} color="#0F766E" />
                <Text style={styles.broadcastBtnText}>Select for Broadcast</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.selectBar}>
                <TouchableOpacity onPress={handleExitSelectMode}>
                  <Text style={styles.selectBarCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.selectBarCount}>{selectedIds.size} selected</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity onPress={handleSelectAll}>
                    <Text style={[styles.selectBarCancel, { color: "#2563EB" }]}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, { paddingVertical: 6, paddingHorizontal: 14, flexDirection: "row", gap: 6, borderRadius: 8 }, selectedIds.size === 0 && { opacity: 0.4 }]}
                    onPress={() => { if (selectedIds.size > 0) setShowBroadcast(true); }}
                    disabled={selectedIds.size === 0}
                  >
                    <Ionicons name="send-outline" size={14} color="#FFFFFF" />
                    <Text style={[styles.sendBtnText, { fontSize: 13 }]}>Broadcast</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.hintText}>
              Showing {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}
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
                : "No invoices match the selected filter."}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        renderItem={({ item }) => {
          const cur = Array.isArray(item.currency_id) ? item.currency_id[1] : settings.defaultCurrency || "UGX";
          const invStatus = getInvoiceStatus(item);
          const isSelected = selectedIds.has(item.id);

          return (
            <TouchableOpacity
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => selectMode ? toggleSelect(item.id) : setSelectedInvoice(item)}
              onLongPress={() => { if (!selectMode) { handleEnterSelectMode(); toggleSelect(item.id); } }}
              activeOpacity={0.82}
            >
              <View style={styles.cardRow}>
                {selectMode ? (
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                  </View>
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.invoiceName} numberOfLines={1}>
                    {item.name || `Invoice #${item.id}`}
                  </Text>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {displayMany2One(item.partner_id, "No customer")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <Text style={[styles.balanceText, invStatus === "paid" && { color: "#166534" }]}>
                    {formatMoney(item.amount_residual, cur)}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: invStatus === "paid" ? "#DCFCE7" : invStatus === "overdue" ? "#FEE2E2" : "#DBEAFE" }]}>
                    <Text style={[styles.statusPillText, { color: invStatus === "paid" ? "#166534" : invStatus === "overdue" ? "#991B1B" : "#1D4ED8" }]}>
                      {statusFilterLabel(invStatus)}
                    </Text>
                  </View>
                  {!selectMode ? (
                    <View style={styles.composePill}>
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color="#0F766E" />
                      <Text style={styles.composePillText}>Message</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {item.invoice_date_due ? (
                <Text style={styles.dueDateText}>Due {formatDateLabel(item.invoice_date_due)}</Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: { padding: 12, backgroundColor: "#F9FAFB" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, color: "#6B7280" },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center" },
  emptyText: { marginTop: 8, color: "#6B7280", textAlign: "center", fontSize: 14, lineHeight: 20 },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  msgBoxBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 10 },
  failedBadge: { position: "absolute", top: 2, right: 2, backgroundColor: "#B91C1C", borderRadius: 8, minWidth: 14, height: 14, justifyContent: "center", alignItems: "center", paddingHorizontal: 2 },
  failedBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 10, padding: 10 },
  warningText: { flex: 1, fontSize: 12, color: "#92400E" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },
  filterRow: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB" },
  filterChipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  filterChipText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  filterChipTextActive: { color: "#FFFFFF" },
  broadcastBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F0FDFA", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#99F6E4" },
  broadcastBtnText: { fontSize: 13, color: "#0F766E", fontWeight: "700" },
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F0FDFA", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#99F6E4" },
  selectBarCancel: { fontSize: 13, color: "#374151", fontWeight: "700" },
  selectBarCount: { fontSize: 13, color: "#0F766E", fontWeight: "700" },
  hintText: { fontSize: 11, color: "#9CA3AF" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "#E5E7EB", gap: 4 },
  cardSelected: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: "#D1D5DB", justifyContent: "center", alignItems: "center", marginRight: 4 },
  checkboxChecked: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  invoiceName: { fontSize: 13, fontWeight: "700", color: "#111827" },
  customerName: { fontSize: 12, color: "#4B5563", marginTop: 1 },
  balanceText: { fontSize: 14, fontWeight: "800", color: "#B91C1C" },
  statusPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  composePill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0FDFA", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "#99F6E4" },
  composePillText: { fontSize: 10, color: "#0F766E", fontWeight: "700" },
  dueDateText: { fontSize: 11, color: "#9CA3AF" },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", backgroundColor: "#FFFFFF" },
  composeClose: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  composeTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  invoiceRef: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#BFDBFE" },
  invoiceRefText: { flex: 1, fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12 },
  infoText: { fontSize: 14, color: "#2563EB" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { flex: 1, color: "#B91C1C", fontSize: 14 },
  sentBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BBF7D0" },
  sentText: { color: "#166534", fontSize: 14, fontWeight: "700" },
  failBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FECACA" },
  failText: { color: "#B91C1C", fontSize: 14, fontWeight: "700" },
  failReason: { color: "#B91C1C", fontSize: 13, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#D1D5DB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" },
  inputMulti: { minHeight: 150, textAlignVertical: "top", lineHeight: 22 },
  charCount: { marginTop: 4, fontSize: 11, color: "#9CA3AF", textAlign: "right" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0F766E", paddingVertical: 14, borderRadius: 12 },
  sendBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  doneBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 12, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" },
  doneBtnText: { color: "#166534", fontWeight: "700", fontSize: 16 },
  recipientItem: { fontSize: 13, color: "#374151", paddingVertical: 2 },
  recipientMore: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" },
});

const msgBox = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#E5E7EB", gap: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  recipient: { fontSize: 13, fontWeight: "700", color: "#111827" },
  phone: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  statusText: { fontSize: 11, fontWeight: "700" },
  preview: { fontSize: 13, color: "#4B5563", lineHeight: 18 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timestamp: { fontSize: 11, color: "#9CA3AF" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#FECACA" },
  retryText: { fontSize: 12, color: "#B91C1C", fontWeight: "700" },
});
