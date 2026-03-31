import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  addScheduleLine,
  authenticate,
  cancelOpenLines,
  changeScheduleLineState,
  fetchScheduleLinesById,
  setScheduleManualStatus,
  updateSchedule,
  updateScheduleLine,
} from "../services/loanApi";
import {
  buildPaidLineSms,
  fetchPartnerPhone,
  sendSms,
} from "../services/twilioSms";
import { useSettings } from "../store/settingsStore";
import { LoanSchedule, LoanScheduleLine, ScheduleLineState } from "../types/odoo";
import { DatePickerInput } from "../components/DatePickerInput";
import { displayMany2One, formatDateLabel, formatMoney, humanizeStatus } from "../utils/format";

// ── Line cache helpers ────────────────────────────────────────────────────────

function lineCacheKey(scheduleId: number): string {
  return `schedule_lines_v1_${scheduleId}`;
}

async function saveLinesCache(scheduleId: number, items: LoanScheduleLine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(lineCacheKey(scheduleId), JSON.stringify(items));
  } catch { /* ignore storage errors */ }
}

async function loadLinesCache(scheduleId: number): Promise<LoanScheduleLine[] | null> {
  try {
    const raw = await AsyncStorage.getItem(lineCacheKey(scheduleId));
    if (!raw) return null;
    return JSON.parse(raw) as LoanScheduleLine[];
  } catch {
    return null;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MANAGEMENT_STATUS_OPTIONS: { value: string; label: string; color: string; bg: string }[] = [
  { value: "running",            label: "Running",            color: "#1D4ED8", bg: "#DBEAFE" },
  { value: "at_risk",            label: "At Risk",            color: "#991B1B", bg: "#FEE2E2" },
  { value: "no_valid_plan",      label: "No Valid Plan",      color: "#9A3412", bg: "#FFEDD5" },
  { value: "non_communicating",  label: "Non Communicating",  color: "#9A3412", bg: "#FFEDD5" },
  { value: "default",            label: "Default",            color: "#374151", bg: "#E5E7EB" },
  { value: "done",               label: "Done",               color: "#166534", bg: "#DCFCE7" },
];

function getStatusStyle(status: string) {
  return MANAGEMENT_STATUS_OPTIONS.find((o) => o.value === status)
    ?? { color: "#374151", bg: "#E5E7EB", label: humanizeStatus(status) };
}

function getLineStateBadge(state: ScheduleLineState) {
  switch (state) {
    case "paid":     return { bg: "#DCFCE7", color: "#166534", label: "Paid" };
    case "missed":   return { bg: "#FEE2E2", color: "#991B1B", label: "Missed" };
    case "canceled": return { bg: "#F3F4F6", color: "#6B7280", label: "Canceled" };
    default:         return { bg: "#DBEAFE", color: "#1D4ED8", label: "Unpaid" };
  }
}

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

// ── Reschedule helpers ────────────────────────────────────────────────────────

type IntervalType = "weekly" | "biweekly" | "monthly" | "custom";

function addIntervalToDate(dateStr: string, type: IntervalType, customDays: number): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (type) {
    case "weekly":   d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly":  d.setMonth(d.getMonth() + 1); break;
    case "custom":   d.setDate(d.getDate() + Math.max(1, customDays)); break;
  }
  return d.toISOString().split("T")[0];
}

const INTERVALS: { type: IntervalType; label: string }[] = [
  { type: "weekly",   label: "Weekly (every 7 days)" },
  { type: "biweekly", label: "Bi-weekly (every 14 days)" },
  { type: "monthly",  label: "Monthly (same day, next month)" },
  { type: "custom",   label: "Custom (specify days)" },
];

// ── Line Edit Sheet ───────────────────────────────────────────────────────────

function LineEditSheet({
  visible,
  line,
  currency,
  onClose,
  onSave,
}: {
  visible: boolean;
  line: LoanScheduleLine | null;
  currency: string;
  onClose: () => void;
  onSave: (lineId: number, vals: { payment_date: string; expected_amount: number; note: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (line) {
      setDate(line.payment_date ?? todayIso());
      setAmount(line.expected_amount.toFixed(0));
      setNote(typeof line.note === "string" ? line.note : "");
    }
  }, [line]);

  const handleSave = async () => {
    if (!line) return;
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Enter date in YYYY-MM-DD format.");
      return;
    }
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a positive amount.");
      return;
    }
    setSaving(true);
    try {
      await onSave(line.id, { payment_date: date, expected_amount: parsedAmount, note: note.trim() });
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={sheet.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={sheet.container}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Edit Payment Line</Text>

          <Text style={sheet.label}>Payment Date</Text>
          <DatePickerInput value={date} onChange={setDate} />

          <Text style={sheet.label}>Expected Amount ({currency})</Text>
          <TextInput
            style={sheet.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="decimal-pad"
          />

          <Text style={sheet.label}>Note (optional)</Text>
          <TextInput
            style={[sheet.input, { height: 72, textAlignVertical: "top" }]}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note…"
            multiline
          />

          <View style={sheet.actions}>
            <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={sheet.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheet.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={sheet.saveText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Add Line Sheet ────────────────────────────────────────────────────────────

function AddLineSheet({
  visible,
  currency,
  onClose,
  onAdd,
}: {
  visible: boolean;
  currency: string;
  onClose: () => void;
  onAdd: (vals: { payment_date: string; expected_amount: number; note: string }) => Promise<void>;
}) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(todayIso());
    setAmount("");
    setNote("");
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Enter date in YYYY-MM-DD format.");
      return;
    }
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a positive amount.");
      return;
    }
    setSaving(true);
    try {
      await onAdd({ payment_date: date, expected_amount: parsedAmount, note: note.trim() });
      reset();
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={sheet.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={sheet.container}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Add Payment Line</Text>

          <Text style={sheet.label}>Payment Date</Text>
          <DatePickerInput value={date} onChange={setDate} />

          <Text style={sheet.label}>Expected Amount ({currency})</Text>
          <TextInput
            style={sheet.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="decimal-pad"
          />

          <Text style={sheet.label}>Note (optional)</Text>
          <TextInput
            style={[sheet.input, { height: 72, textAlignVertical: "top" }]}
            value={note}
            onChangeText={setNote}
            placeholder="Rescheduled, agreed amount…"
            multiline
          />

          <View style={sheet.actions}>
            <TouchableOpacity style={sheet.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={sheet.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheet.saveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={sheet.saveText}>Add Line</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Edit Schedule Sheet ───────────────────────────────────────────────────────

function EditScheduleSheet({
  visible,
  currentName,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (vals: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Invalid", "Schedule name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: trimmed });
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheet.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={sheet.container}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Edit Schedule</Text>
          <Text style={sheet.label}>Schedule Name / Reference</Text>
          <TextInput
            style={sheet.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. SCH/00123"
            autoCapitalize="characters"
          />
          <View style={sheet.actions}>
            <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={sheet.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheet.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={sheet.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Bulk Reschedule Sheet ─────────────────────────────────────────────────────

function BulkRescheduleSheet({
  visible,
  currency,
  openLinesCount,
  onClose,
  onReschedule,
}: {
  visible: boolean;
  currency: string;
  openLinesCount: number;
  onClose: () => void;
  onReschedule: (vals: {
    startDate: string;
    intervalType: IntervalType;
    customDays: number;
    amount: number;
    installments: number;
    note: string;
  }) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(todayIso());
  const [intervalType, setIntervalType] = useState<IntervalType>("monthly");
  const [customDays, setCustomDays] = useState("30");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState(String(openLinesCount || 1));
  const [note, setNote] = useState(`Rescheduled on ${todayIso()}`);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setStartDate(todayIso());
      setInstallments(String(openLinesCount || 1));
      setNote(`Rescheduled on ${todayIso()}`);
      setAmount("");
      setSaving(false);
    }
  }, [visible, openLinesCount]);

  const handleConfirm = async () => {
    if (!isValidDate(startDate)) {
      Alert.alert("Invalid Date", "Enter a valid start date (YYYY-MM-DD).");
      return;
    }
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Invalid Amount", "Enter a positive amount per installment.");
      return;
    }
    const parsedInstallments = parseInt(installments, 10);
    if (!parsedInstallments || parsedInstallments <= 0 || parsedInstallments > 120) {
      Alert.alert("Invalid Installments", "Enter a number between 1 and 120.");
      return;
    }
    const parsedCustomDays = parseInt(customDays, 10);
    if (intervalType === "custom" && (!parsedCustomDays || parsedCustomDays <= 0)) {
      Alert.alert("Invalid Days", "Enter a positive number of days.");
      return;
    }
    Alert.alert(
      "Confirm Reschedule",
      `This will cancel ${openLinesCount} open line(s) and create ${parsedInstallments} new payment line(s) starting ${startDate}.\n\nThis action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reschedule",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await onReschedule({
                startDate,
                intervalType,
                customDays: parsedCustomDays || 30,
                amount: parsedAmount,
                installments: parsedInstallments,
                note: note.trim() || `Rescheduled on ${todayIso()}`,
              });
              onClose();
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheet.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[sheet.container, { padding: 0, paddingBottom: 0 }]}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === "ios" ? 40 : 24, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={sheet.handle} />
            <Text style={sheet.title}>Reschedule Payment Plan</Text>
            <Text style={sheet.subtitle}>
              {openLinesCount} open line(s) will be canceled and replaced with a new schedule below.
            </Text>

            <Text style={sheet.label}>New Start Date</Text>
            <DatePickerInput value={startDate} onChange={setStartDate} />

            <Text style={sheet.label}>Payment Interval</Text>
            {INTERVALS.map((intv) => (
              <TouchableOpacity
                key={intv.type}
                style={[reschedStyle.intervalRow, intervalType === intv.type && reschedStyle.intervalRowActive]}
                onPress={() => setIntervalType(intv.type)}
              >
                <View style={[reschedStyle.radio, intervalType === intv.type && reschedStyle.radioActive]} />
                <Text style={[reschedStyle.intervalLabel, intervalType === intv.type && { color: "#2563EB", fontWeight: "700" }]}>
                  {intv.label}
                </Text>
              </TouchableOpacity>
            ))}

            {intervalType === "custom" && (
              <>
                <Text style={sheet.label}>Days Between Payments</Text>
                <TextInput
                  style={sheet.input}
                  value={customDays}
                  onChangeText={setCustomDays}
                  placeholder="30"
                  keyboardType="number-pad"
                />
              </>
            )}

            <Text style={sheet.label}>Amount per Installment ({currency})</Text>
            <TextInput
              style={sheet.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
            />

            <Text style={sheet.label}>Number of Installments</Text>
            <TextInput
              style={sheet.input}
              value={installments}
              onChangeText={setInstallments}
              placeholder="1"
              keyboardType="number-pad"
            />

            <Text style={sheet.label}>Reschedule Note</Text>
            <TextInput
              style={[sheet.input, { height: 60, textAlignVertical: "top" }]}
              value={note}
              onChangeText={setNote}
              placeholder={`Rescheduled on ${todayIso()}`}
              multiline
            />

            <View style={sheet.actions}>
              <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={sheet.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sheet.saveBtn, { backgroundColor: "#DC2626" }]}
                onPress={handleConfirm}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={sheet.saveText}>Reschedule</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Status Picker ─────────────────────────────────────────────────────────────

function StatusPickerSheet({
  visible,
  current,
  onClose,
  onSelect,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (status: string | false) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const handleSelect = async (status: string | false) => {
    setSaving(true);
    try {
      await onSelect(status);
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheet.overlay}>
        <View style={[sheet.container, { paddingBottom: 32 }]}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Set Management Status</Text>
          <Text style={sheet.subtitle}>
            A manual status overrides the automatic one until you clear it.
          </Text>

          {MANAGEMENT_STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                statusPicker.row,
                current === opt.value && { backgroundColor: opt.bg, borderColor: opt.color },
              ]}
              onPress={() => handleSelect(opt.value)}
              disabled={saving}
            >
              <View style={[statusPicker.dot, { backgroundColor: opt.color }]} />
              <Text style={[statusPicker.label, current === opt.value && { color: opt.color, fontWeight: "700" }]}>
                {opt.label}
              </Text>
              {current === opt.value && (
                <Ionicons name="checkmark-circle" size={18} color={opt.color} />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[statusPicker.row, statusPicker.autoRow]}
            onPress={() => handleSelect(false)}
            disabled={saving}
          >
            <Ionicons name="refresh-outline" size={16} color="#2563EB" />
            <Text style={[statusPicker.label, { color: "#2563EB" }]}>Use Auto Status</Text>
          </TouchableOpacity>

          <TouchableOpacity style={sheet.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={sheet.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Line Row ──────────────────────────────────────────────────────────────────

function LineRow({
  line,
  currency,
  onEdit,
  onChangeState,
  busy,
}: {
  line: LoanScheduleLine;
  currency: string;
  onEdit: (line: LoanScheduleLine) => void;
  onChangeState: (line: LoanScheduleLine, action: "action_mark_paid" | "action_mark_unpaid" | "action_mark_missed" | "action_mark_canceled") => void;
  busy: boolean;
}) {
  const badge = getLineStateBadge(line.state);
  const [expanded, setExpanded] = useState(false);
  const isRescheduled = typeof line.note === "string" && line.note.toLowerCase().includes("reschedul");

  const stateActions: { action: "action_mark_paid" | "action_mark_unpaid" | "action_mark_missed" | "action_mark_canceled"; label: string; color: string; bg: string }[] = [];
  if (line.state !== "paid")     stateActions.push({ action: "action_mark_paid",     label: "Mark Paid",     color: "#166534", bg: "#DCFCE7" });
  if (line.state !== "unpaid" && line.state !== "canceled")   stateActions.push({ action: "action_mark_unpaid",   label: "Mark Unpaid",   color: "#1D4ED8", bg: "#DBEAFE" });
  if (line.state !== "missed" && line.state !== "canceled")   stateActions.push({ action: "action_mark_missed",   label: "Mark Missed",   color: "#991B1B", bg: "#FEE2E2" });
  if (line.state !== "canceled") stateActions.push({ action: "action_mark_canceled", label: "Cancel",        color: "#6B7280", bg: "#F3F4F6" });

  return (
    <View style={lineRow.card}>
      <TouchableOpacity style={lineRow.header} onPress={() => setExpanded((p) => !p)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={lineRow.date}>{formatDateLabel(line.payment_date)}</Text>
          {line.note ? (
            <Text style={lineRow.note} numberOfLines={expanded ? undefined : 1}>{line.note}</Text>
          ) : null}
          {isRescheduled && (
            <View style={lineRow.rescheduledPill}>
              <Ionicons name="repeat-outline" size={10} color="#0369A1" />
              <Text style={lineRow.rescheduledText}>Rescheduled</Text>
            </View>
          )}
          {line.paid_date ? (
            <Text style={lineRow.paidDate}>Paid on {formatDateLabel(line.paid_date)}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={lineRow.amount}>{formatMoney(line.expected_amount, currency)}</Text>
          <View style={[lineRow.badge, { backgroundColor: badge.bg }]}>
            <Text style={[lineRow.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={16}
          color="#9CA3AF"
          style={{ marginLeft: 8 }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={lineRow.actions}>
          {line.state !== "canceled" && (
            <TouchableOpacity
              style={lineRow.editBtn}
              onPress={() => onEdit(line)}
              disabled={busy}
            >
              <Ionicons name="create-outline" size={14} color="#2563EB" />
              <Text style={lineRow.editText}>Edit Date / Amount</Text>
            </TouchableOpacity>
          )}
          <View style={lineRow.stateButtons}>
            {stateActions.map((sa) => (
              <TouchableOpacity
                key={sa.action}
                style={[lineRow.stateBtn, { backgroundColor: sa.bg }]}
                onPress={() => onChangeState(line, sa.action)}
                disabled={busy}
              >
                <Text style={[lineRow.stateBtnText, { color: sa.color }]}>{sa.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  schedule: LoanSchedule | null;
  onClose: () => void;
  onUpdated: () => void; // refresh parent list after changes
}

export function ScheduleDetailModal({ visible, schedule, onClose, onUpdated }: Props) {
  const { settings } = useSettings();
  const currency = settings.defaultCurrency || "UGX";

  const [lines, setLines] = useState<LoanScheduleLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [busyLineId, setBusyLineId] = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<LoanScheduleLine | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [localSchedule, setLocalSchedule] = useState<LoanSchedule | null>(null);

  // SMS state for post-mark-paid acknowledgment
  const [smsModal, setSmsModal] = useState<{
    phone: string;
    message: string;
    sending: boolean;
    result: "sent" | "failed" | null;
    error: string | null;
  } | null>(null);

  // Keep local copy of schedule so we can update status without refetching whole list
  useEffect(() => {
    setLocalSchedule(schedule);
  }, [schedule]);

  const loadLines = useCallback(async () => {
    if (!schedule) return;
    setLoadingLines(true);
    setLineError(null);

    // Serve from cache immediately; hide spinner if cache is available
    const cached = await loadLinesCache(schedule.id);
    if (cached) {
      setLines(cached);
      setLoadingLines(false); // show cached data immediately without blocking spinner
    }

    try {
      const uid = await authenticate(settings);
      const fetched = await fetchScheduleLinesById(settings, uid, schedule.id);
      setLines(fetched);
      await saveLinesCache(schedule.id, fetched);
    } catch (e: unknown) {
      if (!cached) {
        setLineError(e instanceof Error ? e.message : String(e));
      }
      // If we have cached data, silently fail and show cached lines
    } finally {
      setLoadingLines(false);
    }
  }, [schedule, settings]);

  useEffect(() => {
    if (visible && schedule) {
      loadLines();
    } else {
      setLines([]);
      setLineError(null);
    }
  }, [visible, schedule, loadLines]);

  const handleEditSave = async (
    lineId: number,
    vals: { payment_date: string; expected_amount: number; note: string }
  ) => {
    setBusyLineId(lineId);
    try {
      const uid = await authenticate(settings);
      await updateScheduleLine(settings, uid, lineId, vals);
      await loadLines();
      onUpdated();
    } finally {
      setBusyLineId(null);
    }
  };

  const handleChangeState = (
    line: LoanScheduleLine,
    action: "action_mark_paid" | "action_mark_unpaid" | "action_mark_missed" | "action_mark_canceled"
  ) => {
    const actionLabels: Record<string, string> = {
      action_mark_paid:     "Mark as Paid",
      action_mark_unpaid:   "Mark as Unpaid",
      action_mark_missed:   "Mark as Missed",
      action_mark_canceled: "Cancel this line",
    };
    Alert.alert(
      actionLabels[action] ?? "Change State",
      `${formatDateLabel(line.payment_date)} · ${formatMoney(line.expected_amount, currency)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: action === "action_mark_canceled" ? "destructive" : "default",
          onPress: async () => {
            setBusyLineId(line.id);
            try {
              const uid = await authenticate(settings);
              await changeScheduleLineState(settings, uid, line.id, action);
              await loadLines();
              onUpdated();

              // After marking paid, offer SMS acknowledgment if SMS is enabled
              if (action === "action_mark_paid" && schedule &&
                  settings.smsEnabled &&
                  settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
                const partnerName = Array.isArray(schedule.partner_id) ? schedule.partner_id[1] : "Customer";
                const freshLines = await loadLinesCache(schedule.id);
                const nextLine = freshLines
                  ? freshLines
                      .filter((l) => l.state === "unpaid" && l.payment_date > line.payment_date)
                      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0] ?? null
                  : null;

                const builtMsg = buildPaidLineSms(
                  partnerName,
                  line.expected_amount,
                  line.payment_date,
                  currency,
                  nextLine
                );

                // Fetch phone number from Odoo
                let phone = "";
                try {
                  if (Array.isArray(schedule.partner_id)) {
                    const fetchedPhone = await fetchPartnerPhone(settings, uid, schedule.partner_id[0]);
                    phone = fetchedPhone ?? "";
                  }
                } catch { /* ignore phone fetch errors */ }

                setSmsModal({ phone, message: builtMsg, sending: false, result: null, error: null });
              }
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : String(e));
            } finally {
              setBusyLineId(null);
            }
          },
        },
      ]
    );
  };

  const handleAddLine = async (vals: { payment_date: string; expected_amount: number; note: string }) => {
    if (!schedule) return;
    const uid = await authenticate(settings);
    await addScheduleLine(settings, uid, schedule.id, vals);
    await loadLines();
    onUpdated();
  };

  const openLines = useMemo(
    () => lines.filter((l) => l.state === "unpaid" || l.state === "missed"),
    [lines]
  );

  const handleEditSchedule = async (vals: { name: string }) => {
    if (!schedule) return;
    const uid = await authenticate(settings);
    await updateSchedule(settings, uid, schedule.id, vals);
    setLocalSchedule((prev) => (prev ? { ...prev, name: vals.name } : prev));
    onUpdated();
  };

  const handleReschedule = async (vals: {
    startDate: string;
    intervalType: IntervalType;
    customDays: number;
    amount: number;
    installments: number;
    note: string;
  }) => {
    if (!schedule) return;
    const uid = await authenticate(settings);
    // Cancel all open lines
    if (openLines.length > 0) {
      await cancelOpenLines(settings, uid, openLines.map((l) => l.id));
    }
    // Create new lines
    let currentDate = vals.startDate;
    for (let i = 0; i < vals.installments; i++) {
      await addScheduleLine(settings, uid, schedule.id, {
        payment_date: currentDate,
        expected_amount: vals.amount,
        note: vals.note,
      });
      if (i < vals.installments - 1) {
        currentDate = addIntervalToDate(currentDate, vals.intervalType, vals.customDays);
      }
    }
    await loadLines();
    onUpdated();
  };

  const rescheduleEvents = useMemo(() => {
    const seen = new Set<string>();
    const events: string[] = [];
    for (const l of lines) {
      if (typeof l.note === "string" && l.note.toLowerCase().includes("reschedul") && !seen.has(l.note)) {
        seen.add(l.note);
        events.push(l.note);
      }
    }
    return events;
  }, [lines]);

  const handleSetStatus = async (status: string | false) => {
    if (!schedule) return;
    const uid = await authenticate(settings);
    await setScheduleManualStatus(settings, uid, schedule.id, status);
    setLocalSchedule((prev) =>
      prev
        ? {
            ...prev,
            manual_management_status: status || false,
            management_status: status || prev.management_status,
          }
        : prev
    );
    onUpdated();
  };

  const currentStatus = localSchedule?.manual_management_status || localSchedule?.management_status || "";
  const statusStyle = getStatusStyle(localSchedule?.management_status ?? "");
  const manualOverride = !!localSchedule?.manual_management_status;

  if (!schedule) return null;

  const handleSmsSend = async () => {
    if (!smsModal) return;
    setSmsModal((prev) => prev ? { ...prev, sending: true, result: null, error: null } : null);
    try {
      await sendSms(
        settings.twilioAccountSid,
        settings.twilioAuthToken,
        settings.twilioFromNumber,
        smsModal.phone.trim(),
        smsModal.message.trim()
      );
      setSmsModal((prev) => prev ? { ...prev, sending: false, result: "sent" } : null);
    } catch (e: unknown) {
      setSmsModal((prev) => prev ? { ...prev, sending: false, result: "failed", error: e instanceof Error ? e.message : String(e) } : null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Edit line sheet */}
      <LineEditSheet
        visible={!!editingLine}
        line={editingLine}
        currency={currency}
        onClose={() => setEditingLine(null)}
        onSave={handleEditSave}
      />
      {/* Add line sheet */}
      <AddLineSheet
        visible={showAddLine}
        currency={currency}
        onClose={() => setShowAddLine(false)}
        onAdd={handleAddLine}
      />
      {/* Edit schedule sheet */}
      <EditScheduleSheet
        visible={showEditSchedule}
        currentName={localSchedule?.name ?? ""}
        onClose={() => setShowEditSchedule(false)}
        onSave={handleEditSchedule}
      />
      {/* Bulk reschedule sheet */}
      <BulkRescheduleSheet
        visible={showReschedule}
        currency={currency}
        openLinesCount={openLines.length}
        onClose={() => setShowReschedule(false)}
        onReschedule={handleReschedule}
      />
      {/* Status picker */}
      <StatusPickerSheet
        visible={showStatusPicker}
        current={currentStatus}
        onClose={() => setShowStatusPicker(false)}
        onSelect={handleSetStatus}
      />
      {/* Payment receipt SMS modal */}
      <Modal
        visible={!!smsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSmsModal(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={smsSheet.container}>
            <View style={smsSheet.handle} />
            <Text style={smsSheet.title}>Send Receipt Message</Text>
            <Text style={smsSheet.subtitle}>
              Send a payment acknowledgment to the customer.
            </Text>

            {smsModal?.result === "sent" ? (
              <View style={smsSheet.sentBox}>
                <Ionicons name="checkmark-circle" size={20} color="#166534" />
                <Text style={smsSheet.sentText}>Message sent successfully!</Text>
              </View>
            ) : null}

            {smsModal?.result === "failed" ? (
              <View style={smsSheet.failBox}>
                <Ionicons name="close-circle" size={16} color="#B91C1C" />
                <Text style={smsSheet.failText}>{smsModal.error ?? "Failed to send"}</Text>
              </View>
            ) : null}

            <Text style={smsSheet.label}>Recipient Phone</Text>
            <TextInput
              style={smsSheet.input}
              value={smsModal?.phone ?? ""}
              onChangeText={(v) => setSmsModal((p) => p ? { ...p, phone: v } : null)}
              placeholder="+256700000000"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            <Text style={smsSheet.label}>Message (tap to edit)</Text>
            <TextInput
              style={[smsSheet.input, smsSheet.inputMulti]}
              value={smsModal?.message ?? ""}
              onChangeText={(v) => setSmsModal((p) => p ? { ...p, message: v } : null)}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={smsSheet.actions}>
              <TouchableOpacity style={smsSheet.cancelBtn} onPress={() => setSmsModal(null)}>
                <Text style={smsSheet.cancelText}>
                  {smsModal?.result === "sent" ? "Done" : "Skip"}
                </Text>
              </TouchableOpacity>
              {smsModal?.result !== "sent" ? (
                <TouchableOpacity
                  style={[smsSheet.sendBtn, smsModal?.sending && { opacity: 0.7 }]}
                  onPress={handleSmsSend}
                  disabled={smsModal?.sending}
                >
                  {smsModal?.sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={16} color="#FFFFFF" />
                      <Text style={smsSheet.sendText}>Send</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={modal.root}>
        {/* Header */}
        <View style={modal.header}>
          <View style={{ flex: 1 }}>
            <Text style={modal.headerTitle} numberOfLines={1}>{localSchedule?.name ?? schedule.name}</Text>
            <Text style={modal.headerSub} numberOfLines={1}>
              {displayMany2One(schedule.partner_id, "No customer")}
            </Text>
          </View>
          <TouchableOpacity style={modal.iconBtn} onPress={() => setShowEditSchedule(true)}>
            <Ionicons name="create-outline" size={20} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity style={modal.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        <ScrollView style={modal.scroll} contentContainerStyle={modal.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Status card */}
          <View style={modal.section}>
            <Text style={modal.sectionTitle}>Management Status</Text>
            <View style={modal.statusRow}>
              <View style={[modal.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[modal.statusBadgeText, { color: statusStyle.color }]}>
                  {humanizeStatus(localSchedule?.management_status ?? "")}
                </Text>
              </View>
              {manualOverride && (
                <View style={modal.manualPill}>
                  <Ionicons name="hand-left-outline" size={11} color="#7C3AED" />
                  <Text style={modal.manualPillText}>Manual override</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={modal.changeStatusBtn} onPress={() => setShowStatusPicker(true)}>
              <Ionicons name="options-outline" size={15} color="#2563EB" />
              <Text style={modal.changeStatusText}>Change Status</Text>
            </TouchableOpacity>
          </View>

          {/* Summary metrics */}
          <View style={modal.section}>
            <Text style={modal.sectionTitle}>Schedule Summary</Text>
            <View style={modal.metricsGrid}>
              <View style={modal.metricCard}>
                <Text style={modal.metricLabel}>Next Payment</Text>
                <Text style={modal.metricValue}>{formatDateLabel(schedule.next_payment_date)}</Text>
              </View>
              <View style={modal.metricCard}>
                <Text style={modal.metricLabel}>Next Amount</Text>
                <Text style={modal.metricValue}>{formatMoney(schedule.next_single_amount, currency)}</Text>
              </View>
              <View style={modal.metricCard}>
                <Text style={modal.metricLabel}>Due Amount</Text>
                <Text style={[modal.metricValue, { color: schedule.due_amount > 0 ? "#991B1B" : "#111827" }]}>
                  {formatMoney(schedule.due_amount, currency)}
                </Text>
              </View>
              <View style={modal.metricCard}>
                <Text style={modal.metricLabel}>Missed</Text>
                <Text style={[modal.metricValue, { color: schedule.missed_count > 0 ? "#991B1B" : "#111827" }]}>
                  {schedule.missed_count}
                </Text>
              </View>
            </View>
          </View>

          {/* Payment Lines */}
          <View style={modal.section}>
            <View style={modal.sectionHeaderRow}>
              <Text style={modal.sectionTitle}>Payment Plan Lines</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[modal.addLineBtn, { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" }]}
                  onPress={() => setShowReschedule(true)}
                >
                  <Ionicons name="repeat-outline" size={16} color="#DC2626" />
                  <Text style={[modal.addLineBtnText, { color: "#DC2626" }]}>Reschedule</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modal.addLineBtn} onPress={() => setShowAddLine(true)}>
                  <Ionicons name="add-circle-outline" size={16} color="#2563EB" />
                  <Text style={modal.addLineBtnText}>Add Line</Text>
                </TouchableOpacity>
              </View>
            </View>

            {loadingLines && (
              <View style={modal.linesLoader}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={modal.loaderText}>Loading lines…</Text>
              </View>
            )}

            {lineError && !loadingLines && (
              <View style={modal.errorRow}>
                <Ionicons name="alert-circle-outline" size={15} color="#B91C1C" />
                <Text style={modal.errorText}>{lineError}</Text>
                <TouchableOpacity onPress={loadLines} style={{ marginLeft: 8 }}>
                  <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "700" }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loadingLines && !lineError && lines.length === 0 && (
              <View style={modal.emptyLines}>
                <Ionicons name="calendar-outline" size={32} color="#D1D5DB" />
                <Text style={modal.emptyLinesText}>No payment lines yet.</Text>
                <Text style={modal.emptyLinesSub}>Tap "Add Line" to create the first instalment.</Text>
              </View>
            )}

            {lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                currency={currency}
                onEdit={(l) => setEditingLine(l)}
                onChangeState={handleChangeState}
                busy={busyLineId === line.id}
              />
            ))}
          </View>

          {/* Reschedule History */}
          {rescheduleEvents.length > 0 && (
            <View style={modal.section}>
              <View style={modal.sectionHeaderRow}>
                <Text style={modal.sectionTitle}>Reschedule History</Text>
                <View style={[modal.addLineBtn, { backgroundColor: "#E0F2FE" }]}>
                  <Ionicons name="repeat-outline" size={14} color="#0369A1" />
                  <Text style={[modal.addLineBtnText, { color: "#0369A1" }]}>
                    {rescheduleEvents.length} event(s)
                  </Text>
                </View>
              </View>
              {rescheduleEvents.map((evt, i) => (
                <View key={i} style={modal.historyRow}>
                  <Ionicons name="repeat-outline" size={15} color="#0369A1" />
                  <Text style={modal.historyText}>{evt}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  container: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  cancelText: {
    fontWeight: "700",
    color: "#374151",
    fontSize: 15,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontWeight: "700",
    color: "#FFFFFF",
    fontSize: 15,
  },
});

const statusPicker = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
  },
  autoRow: {
    marginTop: 4,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
});

const lineRow = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  date: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  note: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    fontStyle: "italic",
  },
  paidDate: {
    fontSize: 12,
    color: "#166534",
    marginTop: 2,
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
  actions: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    padding: 12,
    gap: 10,
    backgroundColor: "#F9FAFB",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignSelf: "flex-start",
  },
  editText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  stateButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stateBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  stateBtnText: {
    fontSize: 13,
    fontWeight: "600",
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
    marginTop: 3,
  },
  rescheduledText: {
    fontSize: 10,
    color: "#0369A1",
    fontWeight: "700",
  },
});

const modal = StyleSheet.create({
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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  manualPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3E8FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  manualPillText: {
    fontSize: 11,
    color: "#7C3AED",
    fontWeight: "600",
  },
  changeStatusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignSelf: "flex-start",
  },
  changeStatusText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "600",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: "#6B7280",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  addLineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addLineBtnText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  linesLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
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
  emptyLines: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyLinesText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
  },
  emptyLinesSub: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0F9FF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  historyText: {
    flex: 1,
    fontSize: 13,
    color: "#0369A1",
    lineHeight: 18,
  },
});

const reschedStyle = StyleSheet.create({
  intervalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  intervalRowActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  radioActive: {
    borderColor: "#2563EB",
    backgroundColor: "#2563EB",
  },
  intervalLabel: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
});



const smsSheet = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  inputMulti: {
    height: 110,
    textAlignVertical: "top",
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
    fontSize: 14,
    fontWeight: "600",
    color: "#166534",
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
    flex: 1,
    fontSize: 13,
    color: "#B91C1C",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  cancelText: {
    fontWeight: "700",
    color: "#374151",
    fontSize: 15,
  },
  sendBtn: {
    flex: 2,
    backgroundColor: "#0F766E",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  sendText: {
    fontWeight: "700",
    color: "#FFFFFF",
    fontSize: 15,
  },
});
