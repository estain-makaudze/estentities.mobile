import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../context/AppContext";
import { SplitEntry } from "../types";
import {
  SplitMode,
  determineSplitMode,
  extractCustomPercentages,
} from "../utils/splits";

const CATEGORIES = [
  "Groceries",
  "Utilities",
  "Rent",
  "Transport",
  "Dining",
  "Health",
  "Entertainment",
  "Other",
];

export default function SettingsScreen() {
  const { state, getCategoryConfig, updateCategoryConfig } = useApp();
  const { users } = state;
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0]);

  // Get the config for the selected category
  const config = getCategoryConfig(selectedCategory);
  const [splitMode, setSplitMode] = useState<SplitMode>(
    determineSplitMode(config, users)
  );

  // Custom split percentages keyed by userId
  const [customPercentages, setCustomPercentages] = useState<
    Record<string, string>
  >(() => extractCustomPercentages(config, users));

  // Update custom percentages when category changes
  React.useEffect(() => {
    const config = getCategoryConfig(selectedCategory);
    setCustomPercentages(extractCustomPercentages(config, users));
    setSplitMode(determineSplitMode(config, users));
  }, [selectedCategory, users, getCategoryConfig]);

  const handleSave = () => {
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

    updateCategoryConfig({
      category: selectedCategory,
      defaultSplits: splits,
    });

    Alert.alert("Success", `Default split for ${selectedCategory} has been saved.`);
  };

  if (users.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.noUsersText}>
          Please add at least one user before configuring category defaults.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Category Default Splits</Text>
        <Text style={styles.subtitle}>
          Configure default split behavior for each expense category. These defaults will be
          automatically applied when adding expenses.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Select Category</Text>
      <View style={styles.pillRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.pill,
              selectedCategory === cat && styles.pillSelected,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.pillText,
                selectedCategory === cat && styles.pillTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Default Split Mode</Text>
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
            No split by default — the payer covers expenses in this category fully.
            Expenses will not affect the shared balance unless you manually configure
            a split when adding the expense.
          </Text>
        </View>
      )}

      {splitMode === "equal" && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Expenses in this category will be split equally among all users by default.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Default for {selectedCategory}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  noUsersText: { fontSize: 16, color: "#6C6C70", textAlign: "center" },

  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#1C1C1E", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#6C6C70", lineHeight: 22 },

  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#6C6C70", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },

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
  percentSymbol: { 
    fontSize: 15, 
    color: "#6C6C70", 
    marginLeft: 4 
  },

  infoBox: { backgroundColor: "#EAF4FF", borderRadius: 10, padding: 12, marginTop: 8 },
  infoText: { fontSize: 13, color: "#4A90D9", lineHeight: 18 },

  saveBtn: { backgroundColor: "#4A90D9", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
