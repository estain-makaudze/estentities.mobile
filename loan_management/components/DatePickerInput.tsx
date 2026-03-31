import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function parseDate(value: string): { y: number; m: number; d: number } {
  const parts = value.split("-");
  const today = new Date();
  const y = parseInt(parts[0]) || today.getFullYear();
  const m = parseInt(parts[1]) || today.getMonth() + 1;
  const d = parseInt(parts[2]) || today.getDate();
  return { y, m, d };
}

// ── StepField ─────────────────────────────────────────────────────────────────

function StepField({
  label,
  value,
  onChange,
  min,
  max,
  width = 68,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  width?: number;
}) {
  const step = (dir: 1 | -1) => {
    const n = parseInt(value) || min;
    onChange(String(clamp(n + dir, min, max)).padStart(2, "0"));
  };

  return (
    <View style={[sf.col, { width }]}>
      <Text style={sf.label}>{label}</Text>
      <TouchableOpacity style={sf.up} onPress={() => step(1)} activeOpacity={0.7}>
        <Ionicons name="chevron-up-outline" size={18} color="#2563EB" />
      </TouchableOpacity>
      <TextInput
        style={sf.input}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={label === "Year" ? 4 : 2}
        selectTextOnFocus
        textAlign="center"
      />
      <TouchableOpacity style={sf.down} onPress={() => step(-1)} activeOpacity={0.7}>
        <Ionicons name="chevron-down-outline" size={18} color="#2563EB" />
      </TouchableOpacity>
    </View>
  );
}

const sf = StyleSheet.create({
  col: {
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    backgroundColor: "#F9FAFB",
    textAlign: "center",
    width: "100%",
  },
  up: {
    paddingVertical: 4,
  },
  down: {
    paddingVertical: 4,
  },
});

// ── DatePickerInput ───────────────────────────────────────────────────────────

interface DatePickerInputProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  inputStyle?: object;
}

export function DatePickerInput({ value, onChange, inputStyle }: DatePickerInputProps) {
  const [visible, setVisible] = useState(false);

  const parsed = parseDate(value);
  const [year, setYear] = useState(String(parsed.y));
  const [month, setMonth] = useState(String(parsed.m).padStart(2, "0"));
  const [day, setDay] = useState(String(parsed.d).padStart(2, "0"));

  const open = () => {
    const p = parseDate(value);
    setYear(String(p.y));
    setMonth(String(p.m).padStart(2, "0"));
    setDay(String(p.d).padStart(2, "0"));
    setVisible(true);
  };

  const confirm = () => {
    const y = clamp(parseInt(year) || new Date().getFullYear(), 2000, 2100);
    const m = clamp(parseInt(month) || 1, 1, 12);
    const maxDay = daysInMonth(y, m);
    const d = clamp(parseInt(day) || 1, 1, maxDay);
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(date);
    setVisible(false);
  };

  const maxDay = daysInMonth(
    clamp(parseInt(year) || new Date().getFullYear(), 2000, 2100),
    clamp(parseInt(month) || 1, 1, 12)
  );

  const displayDate = value || "Select date";

  return (
    <>
      <TouchableOpacity style={[dp.field, inputStyle]} onPress={open} activeOpacity={0.75}>
        <Ionicons name="calendar-outline" size={16} color="#6B7280" />
        <Text style={dp.dateText}>{displayDate}</Text>
        <Ionicons name="chevron-down-outline" size={14} color="#9CA3AF" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={dp.overlay}>
          <View style={dp.card}>
            <Text style={dp.title}>Select Date</Text>

            <View style={dp.pickerRow}>
              <StepField
                label="Year"
                value={year}
                onChange={setYear}
                min={2000}
                max={2100}
                width={84}
              />
              <Text style={dp.sep}>/</Text>
              <StepField
                label="Month"
                value={month}
                onChange={setMonth}
                min={1}
                max={12}
              />
              <Text style={dp.sep}>/</Text>
              <StepField
                label="Day"
                value={day}
                onChange={setDay}
                min={1}
                max={maxDay}
              />
            </View>

            <View style={dp.actions}>
              <TouchableOpacity
                style={dp.cancelBtn}
                onPress={() => setVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={dp.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dp.confirmBtn}
                onPress={confirm}
                activeOpacity={0.8}
              >
                <Text style={dp.confirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const dp = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#F9FAFB",
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sep: {
    fontSize: 22,
    fontWeight: "700",
    color: "#9CA3AF",
    marginTop: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
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
  confirmBtn: {
    flex: 2,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  confirmText: {
    fontWeight: "700",
    color: "#FFFFFF",
    fontSize: 15,
  },
});
