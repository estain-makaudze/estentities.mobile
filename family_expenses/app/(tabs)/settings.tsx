import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { SplitEntry } from "../../types";
import {
  SplitMode,
  determineSplitMode,
  extractCustomPercentages,
} from "../../utils/splits";

const EMOJI_OPTIONS = ["🛒","💡","🏠","🚗","🍽️","💊","🎬","📦","✈️","🎓","👗","🐾","🎮","🏋️","🧹","🎁","🍕","☕","🏥","💰"];

export default function SettingsScreen() {
  const { state, getCategoryConfig, updateCategoryConfig, addCategory, deleteCategory } = useApp();
  const { members: users } = useHousehold();
  const { customCategories } = state;

  // ── Category Management ──────────────────────────────────────────────────
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📦");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) { Alert.alert("Validation", "Please enter a category name."); return; }
    if (customCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert("Validation", "A category with that name already exists.");
      return;
    }
    addCategory(name, newCatEmoji);
    setNewCatName("");
    setNewCatEmoji("📦");
  };

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert(
      "Delete Category",
      `Delete "${name}"? Existing expenses with this category will keep their label.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteCategory(id) },
      ]
    );
  };

  // ── Default Splits per Category ──────────────────────────────────────────
  const categoryNames = useMemo(() => customCategories.map((c) => c.name), [customCategories]);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryNames[0] ?? "");

  const config = getCategoryConfig(selectedCategory);
  const [splitMode, setSplitMode] = useState<SplitMode>(determineSplitMode(config, users));
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>(
    () => extractCustomPercentages(config, users)
  );

  React.useEffect(() => {
    if (categoryNames.length > 0 && !categoryNames.includes(selectedCategory)) {
      setSelectedCategory(categoryNames[0]);
    }
  }, [categoryNames, selectedCategory]);

  React.useEffect(() => {
    const c = getCategoryConfig(selectedCategory);
    setCustomPercentages(extractCustomPercentages(c, users));
    setSplitMode(determineSplitMode(c, users));
  }, [selectedCategory, users, getCategoryConfig]);

  const handleSave = () => {
    if (users.length === 0) { Alert.alert("No Users", "Add family members before saving split defaults."); return; }
    let splits: SplitEntry[] | null = null;
    if (splitMode === "equal") {
      const pct = 100 / users.length;
      splits = users.map((u, i) => ({
        userId: u.id,
        percentage:
          i === users.length - 1
            ? 100 - parseFloat((pct * (users.length - 1)).toFixed(4))
            : parseFloat(pct.toFixed(4)),
      }));
    } else if (splitMode === "custom") {
      const entries: SplitEntry[] = [];
      let total = 0;
      for (const u of users) {
        const pct = parseFloat(customPercentages[u.id] ?? "0");
        if (isNaN(pct) || pct < 0) { Alert.alert("Validation", `Invalid % for ${u.name}.`); return; }
        entries.push({ userId: u.id, percentage: pct });
        total += pct;
      }
      if (Math.abs(total - 100) > 0.1) {
        Alert.alert("Validation", `Percentages must total 100%. Current: ${total.toFixed(1)}%`);
        return;
      }
      splits = entries;
    }
    updateCategoryConfig({ category: selectedCategory, defaultSplits: splits });
    Alert.alert("Saved", `Default split for ${selectedCategory} has been saved.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Categories Section ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>📂 Expense Categories</Text>
        <Text style={styles.sectionSubtitle}>Add or remove categories to fit your needs.</Text>

        {/* Existing categories */}
        <View style={styles.categoryList}>
          {customCategories.map((cat) => (
            <View key={cat.id} style={styles.categoryRow}>
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={styles.categoryName}>{cat.name}</Text>
              <TouchableOpacity
                style={styles.catDeleteBtn}
                onPress={() => handleDeleteCategory(cat.id, cat.name)}
              >
                <Text style={styles.catDeleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Add category form */}
        <View style={styles.addCatForm}>
          <TouchableOpacity
            style={styles.emojiPickerBtn}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Text style={styles.emojiPickerBtnText}>{newCatEmoji}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.catInput}
            placeholder="New category name…"
            value={newCatName}
            onChangeText={setNewCatName}
            returnKeyType="done"
            onSubmitEditing={handleAddCategory}
          />
          <TouchableOpacity style={styles.catAddBtn} onPress={handleAddCategory}>
            <Text style={styles.catAddBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {showEmojiPicker && (
          <View style={styles.emojiGrid}>
            {EMOJI_OPTIONS.map((em) => (
              <TouchableOpacity
                key={em}
                style={[styles.emojiOption, newCatEmoji === em && styles.emojiOptionSelected]}
                onPress={() => { setNewCatEmoji(em); setShowEmojiPicker(false); }}
              >
                <Text style={styles.emojiOptionText}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Default Splits Section ─────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>⚖️ Default Splits by Category</Text>
        <Text style={styles.sectionSubtitle}>
          Configure how expenses are split by default when adding them.
        </Text>

        {users.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Add family members first to configure default splits.</Text>
          </View>
        ) : categoryNames.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Add categories above to configure default splits.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Select Category</Text>
            <View style={styles.pillRow}>
              {categoryNames.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pill, selectedCategory === cat && styles.pillSelected]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.pillText, selectedCategory === cat && styles.pillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Split Mode</Text>
            <View style={styles.splitModeRow}>
              {(["none", "equal", "custom"] as SplitMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.splitModeBtn, splitMode === mode && styles.splitModeBtnActive]}
                  onPress={() => setSplitMode(mode)}
                >
                  <Text style={[styles.splitModeBtnText, splitMode === mode && styles.splitModeBtnTextActive]}>
                    {mode === "none" ? "No Split" : mode === "equal" ? "Equal" : "Custom %"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {splitMode === "custom" && (
              <View style={styles.customSplitBox}>
                <Text style={styles.customSplitHint}>Percentages must add up to 100%</Text>
                {users.map((u) => (
                  <View key={u.id} style={styles.customSplitRow}>
                    <View style={[styles.smallAvatar, { backgroundColor: u.color }]}>
                      <Text style={styles.avatarText}>{u.name[0].toUpperCase()}</Text>
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
                  The payer covers this category fully. No balance effect.
                </Text>
              </View>
            )}
            {splitMode === "equal" && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Expenses split equally among all family members by default.
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Default for {selectedCategory}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 48 },

  section: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionHeader: { fontSize: 17, fontWeight: "700", color: "#1C1C1E", marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: "#6C6C70", lineHeight: 18, marginBottom: 14 },

  categoryList: { marginBottom: 12 },
  categoryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F2F2F7" },
  categoryEmoji: { fontSize: 22, marginRight: 10 },
  categoryName: { flex: 1, fontSize: 16, color: "#1C1C1E" },
  catDeleteBtn: { backgroundColor: "#FFF0F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  catDeleteBtnText: { color: "#E74C3C", fontSize: 14, fontWeight: "700" },

  addCatForm: { flexDirection: "row", alignItems: "center", gap: 8 },
  emojiPickerBtn: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: "#F2F2F7",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E5EA",
  },
  emojiPickerBtnText: { fontSize: 22 },
  catInput: {
    flex: 1, backgroundColor: "#F2F2F7", borderRadius: 10, padding: 10,
    fontSize: 15, color: "#1C1C1E", borderWidth: 1, borderColor: "#E5E5EA",
  },
  catAddBtn: { backgroundColor: "#4A90D9", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  catAddBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  emojiOption: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" },
  emojiOptionSelected: { backgroundColor: "#E0EEFF", borderWidth: 2, borderColor: "#4A90D9" },
  emojiOptionText: { fontSize: 22 },

  label: { fontSize: 13, fontWeight: "600", color: "#6C6C70", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#E5E5EA" },
  pillSelected: { backgroundColor: "#4A90D9" },
  pillText: { fontSize: 14, color: "#3A3A3C" },
  pillTextActive: { color: "#fff", fontWeight: "600" },

  splitModeRow: { flexDirection: "row", gap: 8 },
  splitModeBtn: { flex: 1, borderRadius: 10, padding: 10, backgroundColor: "#E5E5EA", alignItems: "center" },
  splitModeBtnActive: { backgroundColor: "#4A90D9" },
  splitModeBtnText: { fontSize: 13, color: "#3A3A3C", textAlign: "center" },
  splitModeBtnTextActive: { color: "#fff", fontWeight: "600" },

  customSplitBox: { backgroundColor: "#F2F2F7", borderRadius: 12, padding: 12, marginTop: 8 },
  customSplitHint: { fontSize: 12, color: "#8E8E93", marginBottom: 10, textAlign: "center" },
  customSplitRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 8 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  customSplitName: { flex: 1, fontSize: 15, color: "#1C1C1E" },
  percentInput: {
    width: 64, borderWidth: 1, borderColor: "#E5E5EA", borderRadius: 8,
    padding: 6, fontSize: 15, textAlign: "right", backgroundColor: "#fff",
  },
  percentSymbol: { fontSize: 15, color: "#6C6C70", marginLeft: 4 },

  infoBox: { backgroundColor: "#EAF4FF", borderRadius: 10, padding: 12, marginTop: 8 },
  infoText: { fontSize: 13, color: "#4A90D9", lineHeight: 18 },

  saveBtn: { backgroundColor: "#4A90D9", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 16 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
