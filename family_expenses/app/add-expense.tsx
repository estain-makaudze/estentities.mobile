import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../context/AppContext";
import { useHousehold } from "../context/HouseholdContext";
import { SplitEntry } from "../types";
import {
  SplitMode,
  determineSplitMode,
  extractCustomPercentages,
} from "../utils/splits";

export default function AddExpenseScreen() {
  const { state, addExpense, getCategoryConfig } = useApp();
  const { members: users } = useHousehold();
  const router = useRouter();
  const { customCategories } = state;
  const categoryNames = customCategories.map((c) => c.name);
  const defaultCategory = categoryNames[0] ?? "Other";

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(users[0]?.id ?? "");
  const [category, setCategory] = useState(defaultCategory);
  const [note, setNote] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");

  // Custom split percentages keyed by userId
  const [customPercentages, setCustomPercentages] = useState<
    Record<string, string>
  >(() => extractCustomPercentages(undefined, users));

  // Apply category default when category changes
  React.useEffect(() => {
    const config = getCategoryConfig(category);
    setCustomPercentages(extractCustomPercentages(config, users));
    setSplitMode(determineSplitMode(config, users));
  }, [category, users, getCategoryConfig]);

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
      Alert.alert("Validation", "Please enter a description.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Validation", "Please enter a valid amount greater than 0.");
      return;
    }
    if (!paidBy) {
      Alert.alert("Validation", "Please select who paid.");
      return;
    }

    let splits: SplitEntry[] | null = null;

    if (splitMode === "equal") {
      const pct = 100 / users.length;
      splits = users.map((u, i) => ({
        userId: u.id,
        // Distribute remainder to the last entry to ensure sum = 100.
        percentage: i === users.length - 1
          ? 100 - parseFloat((pct * (users.length - 1)).toFixed(4))
          : parseFloat(pct.toFixed(4)),
      }));
    } else if (splitMode === "custom") {
      const entries: SplitEntry[] = [];
      let total = 0;
      for (const u of users) {
        const pct = parseFloat(customPercentages[u.id] ?? "0");
        if (isNaN(pct) || pct < 0) {
          Alert.alert("Validation", `Invalid percentage for ${u.name}.`);
          return;
        }
        entries.push({ userId: u.id, percentage: pct });
        total += pct;
      }
      if (Math.abs(total - 100) > 0.1) {
        Alert.alert(
          "Validation",
          `Percentages must add up to 100%. Current total: ${total.toFixed(1)}%`
        );
        return;
      }
      splits = entries;
    }
    // splitMode === "none" → splits stays null

    addExpense({
      description: description.trim(),
      amount: parsedAmount,
      date: new Date().toISOString(),
      paidBy,
      category,
      splits,
      note: note.trim() || undefined,
    });

    router.back();
  };

  if (users.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.noUsersText}>
          No household members found. Invite family members to get started.
        </Text>
        <TouchableOpacity
          style={styles.goUsersBtn}
          onPress={() => router.push("/(tabs)/household")}
        >
          <Text style={styles.goUsersBtnText}>Go to Household</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Description</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Weekly groceries"
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.sectionTitle}>Amount ($)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <Text style={styles.sectionTitle}>Paid By</Text>
        <View style={styles.pillRow}>
          {users.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[
                styles.pill,
                paidBy === u.id && { backgroundColor: u.color },
              ]}
              onPress={() => setPaidBy(u.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  paidBy === u.id && styles.pillTextActive,
                ]}
              >
                {u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.pillRow}>
          {categoryNames.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.pill,
                category === cat && styles.pillSelected,
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[
                  styles.pillText,
                  category === cat && styles.pillTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Split</Text>
        <View style={styles.splitModeRow}>
          {(["none", "equal", "custom"] as SplitMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.splitModeBtn,
                splitMode === mode && styles.splitModeBtnActive,
              ]}
              onPress={() => setSplitMode(mode)}
            >
              <Text
                style={[
                  styles.splitModeBtnText,
                  splitMode === mode && styles.splitModeBtnTextActive,
                ]}
              >
                {mode === "none"
                  ? "No Split"
                  : mode === "equal"
                  ? "Equal Split"
                  : "Custom %"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {splitMode === "custom" && (
          <View style={styles.customSplitBox}>
            <Text style={styles.customSplitHint}>
              Percentages must add up to 100%
            </Text>
            {users.map((u) => (
              <View key={u.id} style={styles.customSplitRow}>
                <View
                  style={[styles.smallAvatar, { backgroundColor: u.color }]}
                >
                  <Text style={styles.avatarText}>
                    {u.name[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.customSplitName}>{u.name}</Text>
                <TextInput
                  style={styles.percentInput}
                  value={customPercentages[u.id]}
                  onChangeText={(v) =>
                    setCustomPercentages((prev) => ({ ...prev, [u.id]: v }))
                  }
                  keyboardType="decimal-pad"
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>
            ))}
          </View>
        )}

        {splitMode === "none" && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              No split — the payer covers this expense fully. It will not affect
              the shared balance.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Note (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="Any additional details…"
          value={note}
          onChangeText={setNote}
          multiline
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Save Expense</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  noUsersText: { fontSize: 16, color: "#6C6C70", textAlign: "center", marginBottom: 16 },
  goUsersBtn: { backgroundColor: "#4A90D9", borderRadius: 12, padding: 14, paddingHorizontal: 28 },
  goUsersBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#6C6C70", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },

  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  noteInput: { minHeight: 72, textAlignVertical: "top" },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#E5E5EA",
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillSelected: { backgroundColor: "#4A90D9" },
  pillText: { fontSize: 14, color: "#3A3A3C" },
  pillTextActive: { color: "#fff", fontWeight: "600" },

  splitModeRow: { flexDirection: "row", gap: 8 },
  splitModeBtn: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#E5E5EA",
    alignItems: "center",
  },
  splitModeBtnActive: { backgroundColor: "#4A90D9" },
  splitModeBtnText: { fontSize: 13, color: "#3A3A3C", textAlign: "center" },
  splitModeBtnTextActive: { color: "#fff", fontWeight: "600" },

  customSplitBox: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: "#E5E5EA" },
  customSplitHint: { fontSize: 12, color: "#8E8E93", marginBottom: 10, textAlign: "center" },
  customSplitRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 8 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  customSplitName: { flex: 1, fontSize: 15, color: "#1C1C1E" },
  percentInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 8,
    padding: 6,
    fontSize: 15,
    textAlign: "right",
    backgroundColor: "#F2F2F7",
  },
  percentSymbol: { fontSize: 15, color: "#6C6C70", marginLeft: 4 },

  infoBox: { backgroundColor: "#EAF4FF", borderRadius: 10, padding: 12, marginTop: 8 },
  infoText: { fontSize: 13, color: "#4A90D9", lineHeight: 18 },

  submitBtn: { backgroundColor: "#4A90D9", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 24 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { borderRadius: 14, padding: 14, alignItems: "center", marginTop: 10 },
  cancelBtnText: { color: "#8E8E93", fontSize: 15 },
});
