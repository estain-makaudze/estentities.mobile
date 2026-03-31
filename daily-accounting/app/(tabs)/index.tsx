// Entry screen – log a daily expense / income (offline-first)
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, getCategories, getCurrencies } from "../../services/odooApi";
import { useCategories } from "../../store/categoriesStore";
import { useQueue } from "../../store/queueStore";
import { useSettings } from "../../store/settingsStore";
import { OdooCurrency } from "../../types/odoo";

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function EntryScreen() {
  const { settings, isLoaded } = useSettings();
  const { enqueue, isOnline, isSyncing, queue } = useQueue();
  const { categories: localCategories } = useCategories();

  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [currency, setCurrency] = useState(settings.defaultCurrency || "USD");

  const [currencies, setCurrencies] = useState<OdooCurrency[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amountRef = useRef<TextInput>(null);
  const isConfigured = !!(settings.baseUrl && settings.db && settings.username && settings.password);

  useEffect(() => {
    setCurrency(settings.defaultCurrency || "USD");
  }, [settings.defaultCurrency]);

  // Auto-select first category when categories load and none is selected
  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
      setSelectedCategoryName(categories[0].name);
    }
  }, [categories, selectedCategoryId]);

  const loadCurrencies = useCallback(async () => {
    if (!isConfigured || !isLoaded || !isOnline) return;
    try {
      const uid = await authenticate(settings);
      const curs = await getCurrencies(settings, uid);
      setCurrencies(curs);
    } catch {
      // currencies fall back to manual text input
    }
  }, [isConfigured, isLoaded, isOnline, settings]);

  useFocusEffect(useCallback(() => { loadCurrencies(); }, [loadCurrencies]));

  useEffect(() => {
    if (categories.length === 0 && localCategories.length > 0) {
      const converted: OdooCategory[] = localCategories.map((c, i) => ({
        id: -(i + 1),
        name: c.name,
        entry_type: c.entry_type,
        color: 0,
      }));
      setCategories(converted);
      if (!selectedCategoryId && converted.length > 0) {
        setSelectedCategoryId(converted[0].id);
        setSelectedCategoryName(converted[0].name);
      }
    }
  }, [localCategories, categories.length, selectedCategoryId]);

  const handleCategoryChange = (val: number) => {
    setSelectedCategoryId(val);
    const cat = categories.find((c) => c.id === val);
    if (cat) setSelectedCategoryName(cat.name);
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid positive amount."); return;
    }
    if (!selectedCategoryId || !selectedCategoryName) {
      Alert.alert("No category", "Please select a category."); return;
    }
    const selectedCat = categories.find((c) => c.id === selectedCategoryId);
    setSaving(true);
    setSaveError(null);
    setLastSaved(null);
    try {
      await enqueue({
        date: formatDate(date),
        categoryId: selectedCategoryId,
        categoryName: selectedCategoryName,
        categoryIsLocal: selectedCat?.isLocal ?? false,
        categoryEntryType: selectedCat?.entry_type,
        currencyCode: currency.trim().toUpperCase(),
        amount: parsedAmount,
        note: note.trim() || undefined,
      });
      const label = `"${selectedCategoryName}" on ${formatDate(date)}: ${currency} ${parsedAmount.toFixed(2)}`;
      setLastSaved(isOnline ? `✓ Saved ${label}` : `📦 Queued offline — ${label}. Will sync when online.`);
      setAmount("");
      setNote("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg);
      Alert.alert("Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = queue.filter((i) => i.status === "pending" || i.status === "syncing").length;
  const failedCount = queue.filter((i) => i.status === "failed").length;

  if (!isLoaded) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  if (!isConfigured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>
          Configure your Odoo connection in the <Text style={styles.link}>Settings</Text> tab.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Status bar */}
        <View style={[styles.statusBar, isOnline ? styles.statusOnline : styles.statusOffline]}>
          <Ionicons
            name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
            size={15} color={isOnline ? "#16A34A" : "#D97706"}
          />
          <Text style={[styles.statusText, { color: isOnline ? "#16A34A" : "#D97706" }]}>
            {isSyncing ? "Syncing to Odoo…" : isOnline ? "Online" : "Offline — entries saved locally"}
          </Text>
          {(pendingCount > 0 || failedCount > 0) && (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>
                {pendingCount > 0 ? `${pendingCount} pending` : ""}
                {pendingCount > 0 && failedCount > 0 ? " · " : ""}
                {failedCount > 0 ? `${failedCount} failed` : ""}
              </Text>
            </View>
          )}
        </View>

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={18} color="#2563EB" />
          <Text style={styles.dateText}>{formatDate(date)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date} mode="date" display="default"
            onChange={(_e, sel) => { setShowDatePicker(Platform.OS === "ios"); if (sel) setDate(sel); }}
          />
        )}

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        {catsLoading ? (
          <View style={styles.pickerContainer}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={{ marginLeft: 8, color: "#6B7280" }}>Loading categories…</Text>
          </View>
        ) : categories.length === 0 ? (
          <View style={styles.pickerContainer}>
            <Text style={{ color: isOnline ? "#EF4444" : "#D97706", flex: 1, fontSize: 13 }}>
              {isOnline ? (catsError ?? "No categories found.") : "Offline — connect once to load categories."}
            </Text>
            {isOnline && <TouchableOpacity onPress={refreshCategories} style={{ paddingHorizontal: 8 }}><Text style={styles.link}>Retry</Text></TouchableOpacity>}
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <Picker selectedValue={selectedCategoryId} onValueChange={(v) => handleCategoryChange(v as number)} style={styles.picker}>
              {categories.map((cat) => (
                <Picker.Item key={cat.id} label={`${cat.name} (${cat.entry_type})${cat.isLocal ? " ⏳" : ""}`} value={cat.id} />
              ))}
            </Picker>
          </View>
        )}

        {/* Currency */}
        <Text style={styles.label}>Currency</Text>
        <View style={styles.pickerContainer}>
          {currencies.length > 0 ? (
            <Picker selectedValue={currency} onValueChange={(v) => setCurrency(v as string)} style={styles.picker}>
              {currencies.map((c) => (
                <Picker.Item key={c.id} label={`${c.name} (${c.symbol})`} value={c.name} />
              ))}
            </Picker>
          ) : (
            <TextInput
              style={[styles.input, { flex: 1, borderWidth: 0 }]}
              value={currency} onChangeText={(t) => setCurrency(t.toUpperCase())}
              placeholder="e.g. USD" autoCapitalize="characters" maxLength={3}
            />
          )}
        </View>

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <TextInput ref={amountRef} style={styles.input} value={amount} onChangeText={setAmount}
          placeholder="0.00" keyboardType="decimal-pad" returnKeyType="done" />

        {/* Note */}
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote}
          placeholder="Add a note…" multiline numberOfLines={3} />

        {/* Save */}
        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed, saving && styles.saveButtonDisabled]}
          onPress={handleSave} disabled={saving}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Ionicons name={isOnline ? "checkmark-circle-outline" : "save-outline"} size={22} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>{isOnline ? "Save Entry" : "Save Offline"}</Text>
            </>
          )}
        </Pressable>

        {lastSaved && !saveError && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            <Text style={styles.successText}>{lastSaved}</Text>
          </View>
        )}
        {saveError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: "#F9FAFB" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#F9FAFB" },
  emptyText: { marginTop: 12, color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22 },
  link: { color: "#2563EB", fontWeight: "600" },
  statusBar: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, borderWidth: 1 },
  statusOnline: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  statusOffline: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" },
  statusText: { fontSize: 13, fontWeight: "500", flex: 1 },
  queueBadge: { backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  queueBadgeText: { fontSize: 11, color: "#92400E", fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4, marginTop: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: "#111827" },
  noteInput: { height: 80, textAlignVertical: "top" },
  pickerContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, overflow: "hidden", flexDirection: "row", alignItems: "center", paddingHorizontal: 4, minHeight: 50 },
  picker: { flex: 1, height: 50 },
  dateButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dateText: { fontSize: 16, color: "#111827" },
  saveButton: { marginTop: 28, backgroundColor: "#2563EB", borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 15 },
  saveButtonPressed: { backgroundColor: "#1D4ED8" },
  saveButtonDisabled: { backgroundColor: "#93C5FD" },
  saveButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  successBanner: { marginTop: 16, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  successText: { color: "#16A34A", flex: 1, fontSize: 14 },
  errorBanner: { marginTop: 16, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { color: "#DC2626", flex: 1, fontSize: 14 },
});
