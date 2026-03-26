import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { authenticate, markScheduleLinePaid } from "../../services/loanApi";
import { sendPaymentReceivedSms } from "../../services/twilioSms";
import { useCache } from "../../store/cacheStore";
import { LocalCollection, useCollections } from "../../store/collectionStore";
import { useSettings } from "../../store/settingsStore";
import { LoanScheduleLine, Many2OneValue } from "../../types/odoo";
import { formatDateLabel, formatMoney } from "../../utils/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function displayM2O(val: Many2OneValue, fallback = "-"): string {
  return Array.isArray(val) ? val[1] : fallback;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Summary pill ─────────────────────────────────────────────────────────────

function SummaryPill({
  icon,
  color,
  bg,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
  value: string | number;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
      <View>
        <Text style={[styles.pillValue, { color }]}>{value}</Text>
        <Text style={styles.pillLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ── Line picker row ───────────────────────────────────────────────────────────

function LinePickerRow({
  line,
  partnerName,
  currency,
  selected,
  alreadyLogged,
  onSelect,
}: {
  line: LoanScheduleLine;
  partnerName: string;
  currency: string;
  selected: boolean;
  alreadyLogged: boolean;
  onSelect: (line: LoanScheduleLine) => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.linePickRow,
        selected && styles.linePickRowSelected,
        alreadyLogged && styles.linePickRowLogged,
      ]}
      onPress={() => onSelect(line)}
      activeOpacity={0.75}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.linePickPartner} numberOfLines={1}>{partnerName}</Text>
        <Text style={styles.linePickInvoice} numberOfLines={1}>
          {displayM2O(line.invoice_id, "—")}
        </Text>
        <View style={styles.linePickMeta}>
          <Ionicons name="calendar-outline" size={11} color="#6B7280" />
          <Text style={styles.linePickDate}>{formatDateLabel(line.payment_date)}</Text>
          {alreadyLogged && (
            <View style={styles.loggedPill}>
              <Text style={styles.loggedPillText}>logged</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.linePickAmount}>{formatMoney(line.expected_amount, currency)}</Text>
        {selected && <Ionicons name="checkmark-circle" size={20} color="#2563EB" style={{ marginTop: 4 }} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Collection card ───────────────────────────────────────────────────────────

function CollectionCard({
  item,
  currency,
  onRecord,
  onDelete,
  isRecording,
  recordError,
}: {
  item: LocalCollection;
  currency: string;
  onRecord: () => void;
  onDelete: () => void;
  isRecording: boolean;
  recordError: string | null;
}) {
  const recorded = item.status === "recorded";

  return (
    <View style={[styles.card, recorded && styles.cardRecorded]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardPartner} numberOfLines={1}>{item.partnerName}</Text>
          <Text style={styles.cardInvoice} numberOfLines={1}>{item.invoiceName}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.cardCollected}>{formatMoney(item.collectedAmount, currency)}</Text>
          <Text style={styles.cardExpected}>of {formatMoney(item.expectedAmount, currency)}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaItem}>
          <Ionicons name="calendar-outline" size={12} color="#6B7280" />
          <Text style={styles.cardMetaText}>Due {formatDateLabel(item.linePaymentDate)}</Text>
        </View>
        <View style={styles.cardMetaItem}>
          <Ionicons name="time-outline" size={12} color="#6B7280" />
          <Text style={styles.cardMetaText}>Logged {timeLabel(item.createdAt)}</Text>
        </View>
      </View>

      {/* Note */}
      {item.note ? (
        <View style={styles.noteRow}>
          <Ionicons name="chatbubble-outline" size={12} color="#9CA3AF" />
          <Text style={styles.noteText} numberOfLines={2}>{item.note}</Text>
        </View>
      ) : null}

      {/* Error */}
      {recordError ? (
        <View style={styles.recordErrorRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#B91C1C" />
          <Text style={styles.recordErrorText}>{recordError}</Text>
        </View>
      ) : null}

      {/* Status + actions */}
      {recorded ? (
        <View style={styles.recordedRow}>
          <Ionicons name="checkmark-circle" size={16} color="#166534" />
          <Text style={styles.recordedText}>
            Recorded to Odoo · {item.recordedAt ? timeLabel(item.recordedAt) : ""}
          </Text>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <View style={styles.notRecordedBadge}>
            <View style={styles.notRecordedDot} />
            <Text style={styles.notRecordedText}>Not Recorded</Text>
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.recordButton}
              onPress={onRecord}
              disabled={isRecording}
              activeOpacity={0.8}
            >
              {isRecording ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.recordButtonText}>Record</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={onDelete} disabled={isRecording}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Add Collection Modal ──────────────────────────────────────────────────────

function AddCollectionModal({
  visible,
  onClose,
  onSave,
  dueLines,
  schedulePartnerMap,
  currency,
  loggedLineIds,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<LocalCollection, "id" | "createdAt" | "status" | "recordedAt">) => void;
  dueLines: LoanScheduleLine[];
  schedulePartnerMap: Record<number, string>;
  currency: string;
  loggedLineIds: Set<number>;
}) {
  const [selectedLine, setSelectedLine] = useState<LoanScheduleLine | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<TextInput>(null);

  const reset = () => {
    setSelectedLine(null);
    setAmount("");
    setNote("");
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectLine = (line: LoanScheduleLine) => {
    setSelectedLine(line);
    setAmount(line.expected_amount.toFixed(0));
    setTimeout(() => amountRef.current?.focus(), 150);
  };

  const getPartner = (scheduleId: Many2OneValue): string => {
    if (!Array.isArray(scheduleId)) return "Unknown";
    return schedulePartnerMap[scheduleId[0]] ?? scheduleId[1] ?? "Unknown";
  };

  const handleSave = () => {
    if (!selectedLine) {
      Alert.alert("No line selected", "Please select a collection line first.");
      return;
    }
    const parsed = parseFloat(amount.replace(",", "."));
    if (!parsed || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter a valid collected amount.");
      return;
    }

    setSaving(true);
    const partner = getPartner(selectedLine.schedule_id);
    onSave({
      scheduleLineId: selectedLine.id,
      scheduleId: Array.isArray(selectedLine.schedule_id) ? selectedLine.schedule_id[0] : 0,
      scheduleName: Array.isArray(selectedLine.schedule_id) ? selectedLine.schedule_id[1] : "",
      invoiceName: displayM2O(selectedLine.invoice_id, "Unknown"),
      partnerName: partner,
      expectedAmount: selectedLine.expected_amount,
      linePaymentDate: selectedLine.payment_date,
      currency,
      collectedAmount: parsed,
      collectedDate: todayLocal(),
      note: note.trim(),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Log Collection</Text>
          <TouchableOpacity
            style={[styles.modalSaveBtn, !selectedLine && styles.modalSaveBtnDisabled]}
            onPress={handleSave}
            disabled={!selectedLine || saving}
          >
            <Text style={[styles.modalSaveBtnText, !selectedLine && styles.modalSaveBtnTextDisabled]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: "#F9FAFB" }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          {/* Line selector */}
          <Text style={styles.formSectionLabel}>Select Payment Line</Text>
          {dueLines.length === 0 ? (
            <View style={styles.noLinesCard}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#22C55E" />
              <Text style={styles.noLinesText}>No due or overdue lines — all clear!</Text>
            </View>
          ) : (
            <View style={styles.linePickList}>
              {dueLines.map((line) => (
                <LinePickerRow
                  key={line.id}
                  line={line}
                  partnerName={getPartner(line.schedule_id)}
                  currency={currency}
                  selected={selectedLine?.id === line.id}
                  alreadyLogged={loggedLineIds.has(line.id)}
                  onSelect={handleSelectLine}
                />
              ))}
            </View>
          )}

          {/* Amount + note (only after line selected) */}
          {selectedLine ? (
            <View style={styles.formFields}>
              <Text style={styles.formLabel}>Amount Collected ({currency})</Text>
              <TextInput
                ref={amountRef}
                style={styles.formInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="0"
              />

              <Text style={styles.formLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formInputMulti]}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Cash received at office"
                multiline
                numberOfLines={3}
                returnKeyType="default"
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CollectScreen() {
  const { settings } = useSettings();
  const { dueLines, schedules, isOnline, refreshAll } = useCache();
  const { collections, isLoaded, addCollection, markRecorded, deleteCollection } = useCollections();

  const [showAddModal, setShowAddModal] = useState(false);
  const [recordingIds, setRecordingIds] = useState<Set<string>>(new Set());
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});

  const currency = settings.defaultCurrency || "UGX";

  // Build partner name lookup from cached schedules
  const schedulePartnerMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of schedules.items) {
      if (Array.isArray(s.partner_id)) map[s.id] = s.partner_id[1];
    }
    return map;
  }, [schedules.items]);

  // IDs of lines already logged locally (not_recorded) so we can flag them in the picker
  const loggedLineIds = useMemo(
    () => new Set(collections.filter((c) => c.status === "not_recorded").map((c) => c.scheduleLineId)),
    [collections]
  );

  // Split by status
  const pending = useMemo(
    () => collections.filter((c) => c.status === "not_recorded"),
    [collections]
  );
  const recorded = useMemo(
    () => collections.filter((c) => c.status === "recorded"),
    [collections]
  );

  // Totals
  const totalCollected = useMemo(
    () => collections.reduce((s, c) => s + c.collectedAmount, 0),
    [collections]
  );
  const totalRecorded = useMemo(
    () => recorded.reduce((s, c) => s + c.collectedAmount, 0),
    [recorded]
  );

  // Handle Record to Odoo
  const handleRecord = useCallback(
    async (item: LocalCollection) => {
      if (!settings.baseUrl || !settings.db || !settings.username || !settings.password) {
        Alert.alert("Not configured", "Set your Odoo connection in Settings first.");
        return;
      }
      if (!isOnline) {
        Alert.alert("Offline", "Connect to record this payment in Odoo.");
        return;
      }

      setRecordingIds((prev) => new Set(prev).add(item.id));
      setRecordErrors((prev) => { const next = { ...prev }; delete next[item.id]; return next; });

      try {
        const uid = await authenticate(settings);
        await markScheduleLinePaid(settings, uid, item.scheduleLineId);
        await markRecorded(item.id);

        // ── Send payment SMS (fire-and-forget, never blocks the UI) ──────────
        if (settings.smsEnabled) {
          sendPaymentReceivedSms(settings, uid, item).catch((smsErr) => {
            console.warn("[SMS] Notification failed:", smsErr?.message ?? smsErr);
          });
        }

        // Refresh due lines so the dashboard updates
        refreshAll().catch(() => {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setRecordErrors((prev) => ({ ...prev, [item.id]: msg }));
      } finally {
        setRecordingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      }
    },
    [isOnline, markRecorded, refreshAll, settings]
  );

  const confirmDelete = useCallback(
    (item: LocalCollection) => {
      Alert.alert(
        "Delete Entry",
        `Remove the local record for ${item.partnerName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteCollection(item.id),
          },
        ]
      );
    },
    [deleteCollection]
  );

  const handleSave = useCallback(
    async (data: Omit<LocalCollection, "id" | "createdAt" | "status" | "recordedAt">) => {
      await addCollection(data);
    },
    [addCollection]
  );

  if (!isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* ── Page header ────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Collect</Text>
            <Text style={styles.pageDate}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>New</Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary pills ──────────────────────────────────────── */}
        <View style={styles.pillRow}>
          <SummaryPill
            icon="hourglass-outline"
            color="#B45309"
            bg="#FFFBEB"
            label="Pending"
            value={pending.length}
          />
          <SummaryPill
            icon="checkmark-circle-outline"
            color="#166534"
            bg="#F0FDF4"
            label="Recorded"
            value={recorded.length}
          />
          <SummaryPill
            icon="cash-outline"
            color="#1D4ED8"
            bg="#EFF6FF"
            label="Recorded Total"
            value={formatMoney(totalRecorded, currency)}
          />
        </View>

        {/* ── Offline warning ────────────────────────────────────── */}
        {!isOnline && pending.length > 0 ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
            <Text style={styles.offlineBannerText}>
              Offline · Connect to record {pending.length} pending entr{pending.length === 1 ? "y" : "ies"} to Odoo
            </Text>
          </View>
        ) : null}

        {/* ── Pending section ────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pending</Text>
          {pending.length > 0 ? (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{pending.length}</Text>
            </View>
          ) : null}
        </View>

        {pending.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="checkmark-done-circle-outline" size={34} color="#22C55E" />
            <Text style={styles.emptySectionText}>All collections recorded 🎉</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {pending.map((item) => (
              <CollectionCard
                key={item.id}
                item={item}
                currency={currency}
                onRecord={() => handleRecord(item)}
                onDelete={() => confirmDelete(item)}
                isRecording={recordingIds.has(item.id)}
                recordError={recordErrors[item.id] ?? null}
              />
            ))}
          </View>
        )}

        {/* ── Recorded section ───────────────────────────────────── */}
        {recorded.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recorded</Text>
              <View style={[styles.sectionBadge, { backgroundColor: "#166534" }]}>
                <Text style={styles.sectionBadgeText}>{recorded.length}</Text>
              </View>
            </View>
            <View style={styles.list}>
              {recorded.map((item) => (
                <CollectionCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onRecord={() => {}}
                  onDelete={() => confirmDelete(item)}
                  isRecording={false}
                  recordError={null}
                />
              ))}
            </View>
            {/* Total summary footer */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total collected & recorded today</Text>
              <Text style={styles.totalAmount}>{formatMoney(totalCollected, currency)}</Text>
            </View>
          </>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Add Collection Modal ──────────────────────────────────── */}
      <AddCollectionModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSave}
        dueLines={dueLines.items}
        schedulePartnerMap={schedulePartnerMap}
        currency={currency}
        loggedLineIds={loggedLineIds}
      />
    </View>
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
    backgroundColor: "#F1F5F9",
  },

  // Page header
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },

  // Summary pills
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    padding: 10,
  },
  pillValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  pillLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Offline banner
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    fontWeight: "500",
  },

  // Sections
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  sectionBadge: {
    backgroundColor: "#2563EB",
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
    fontSize: 14,
    color: "#166534",
    fontWeight: "600",
  },
  list: { gap: 10 },

  // Collection card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  cardRecorded: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F9FFFE",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardPartner: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardInvoice: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
  },
  cardCollected: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563EB",
  },
  cardExpected: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 1,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  cardMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  recordErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 8,
  },
  recordErrorText: {
    flex: 1,
    fontSize: 12,
    color: "#B91C1C",
  },
  // Not recorded footer
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notRecordedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notRecordedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  notRecordedText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 88,
    justifyContent: "center",
  },
  recordButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  // Recorded footer
  recordedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    padding: 8,
  },
  recordedText: {
    fontSize: 13,
    color: "#166534",
    fontWeight: "600",
  },

  // Total footer card
  totalCard: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    color: "#BFDBFE",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  totalAmount: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  // ── Modal ──────────────────────────────────────────────────────

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  modalSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#2563EB",
  },
  modalSaveBtnDisabled: {
    backgroundColor: "#BFDBFE",
  },
  modalSaveBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  modalSaveBtnTextDisabled: {
    color: "#FFFFFF",
  },

  // Section label inside modal
  formSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },

  // Line picker
  linePickList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  linePickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  linePickRowSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  linePickRowLogged: {
    opacity: 0.6,
  },
  linePickPartner: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  linePickInvoice: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  linePickMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  linePickDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  linePickAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2563EB",
  },
  loggedPill: {
    marginLeft: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  loggedPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
  },

  // No lines
  noLinesCard: {
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  noLinesText: {
    color: "#166534",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },

  // Form fields
  formFields: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 4,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  formInputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});

