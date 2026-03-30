// Settings screen – configure Odoo connection, app defaults, and categories
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate } from "../../services/odooApi";
import { useAuth } from "../../store/authStore";
import { LocalCategory, useCategories } from "../../store/categoriesStore";
import { useSettings } from "../../store/settingsStore";
import { OdooSettings } from "../../types/odoo";

const CATEGORY_COLORS = [
  "#EF4444", "#F59E0B", "#3B82F6", "#8B5CF6", "#10B981",
  "#F97316", "#06B6D4", "#EC4899", "#22C55E", "#6B7280",
];

export default function SettingsScreen() {
  const { settings, saveSettings } = useSettings();
  const { logout } = useAuth();
  const { categories, addCategory, updateCategory, deleteCategory, resetToDefaults } = useCategories();

  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [db, setDb] = useState(settings.db);
  const [username, setUsername] = useState(settings.username);
  const [password, setPassword] = useState(settings.password);
  const [defaultCurrency, setDefaultCurrency] = useState(settings.defaultCurrency || "USD");

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<LocalCategory | null>(null);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<"expense" | "income">("expense");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);

  useEffect(() => {
    setBaseUrl(settings.baseUrl);
    setDb(settings.db);
    setUsername(settings.username);
    setPassword(settings.password);
    setDefaultCurrency(settings.defaultCurrency || "USD");
  }, [settings]);

  const currentDraft: OdooSettings = {
    baseUrl: baseUrl.trim(),
    db: db.trim(),
    username: username.trim(),
    password,
    defaultCurrency: defaultCurrency.trim().toUpperCase() || "USD",
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const uid = await authenticate(currentDraft);
      setTestResult({ ok: true, msg: `Connected! User ID: ${uid}` });
    } catch (e: unknown) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(currentDraft);
      Alert.alert("Saved", "Settings have been saved successfully.");
    } catch {
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const openAddCategory = () => {
    setEditingCat(null);
    setCatName("");
    setCatType("expense");
    setCatColor(CATEGORY_COLORS[0]);
    setShowCatModal(true);
  };

  const openEditCategory = (cat: LocalCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatType(cat.entry_type);
    setCatColor(cat.color);
    setShowCatModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) { Alert.alert("Missing name", "Enter a category name."); return; }
    if (editingCat) {
      await updateCategory(editingCat.id, { name: catName.trim(), entry_type: catType, color: catColor });
    } else {
      await addCategory({ name: catName.trim(), entry_type: catType, color: catColor });
    }
    setShowCatModal(false);
  };

  const handleDeleteCategory = (cat: LocalCategory) => {
    Alert.alert("Delete Category", `Remove "${cat.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteCategory(cat.id) },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Odoo Connection</Text>

          <Text style={styles.label}>Server URL</Text>
          <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://your-odoo.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" />

          <Text style={styles.label}>Database</Text>
          <TextInput style={styles.input} value={db} onChangeText={setDb} placeholder="your_database_name" autoCapitalize="none" autoCorrect={false} />

          <Text style={styles.label}>Username / Email</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="admin@example.com" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />

          <Text style={styles.label}>Password / API Key</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoCapitalize="none" autoCorrect={false} />

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>App Defaults</Text>

          <Text style={styles.label}>Default Currency (ISO code)</Text>
          <TextInput style={styles.input} value={defaultCurrency} onChangeText={(t) => setDefaultCurrency(t.toUpperCase())} placeholder="USD" autoCapitalize="characters" maxLength={3} />

          <Pressable style={({ pressed }) => [styles.testButton, pressed && styles.buttonPressed]} onPress={handleTest} disabled={testing}>
            {testing ? <ActivityIndicator color="#2563EB" /> : (
              <><Ionicons name="wifi-outline" size={18} color="#2563EB" /><Text style={styles.testButtonText}>Test Connection</Text></>
            )}
          </Pressable>

          {testResult && (
            <View style={[styles.resultBanner, testResult.ok ? styles.successBanner : styles.errorBanner]}>
              <Ionicons name={testResult.ok ? "checkmark-circle" : "alert-circle"} size={18} color={testResult.ok ? "#16A34A" : "#DC2626"} />
              <Text style={[styles.resultText, { color: testResult.ok ? "#16A34A" : "#DC2626" }]}>{testResult.msg}</Text>
            </View>
          )}

          <Pressable style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : (
              <><Ionicons name="save-outline" size={20} color="#FFFFFF" /><Text style={styles.saveButtonText}>Save Settings</Text></>
            )}
          </Pressable>

          <View style={styles.catSectionHeader}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Categories</Text>
            <TouchableOpacity style={styles.addCatBtn} onPress={openAddCategory}>
              <Ionicons name="add" size={16} color="#2563EB" />
              <Text style={styles.addCatBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.catList}>
            {categories.map((cat) => (
              <View key={cat.id} style={styles.catItem}>
                <View style={[styles.catColorDot, { backgroundColor: cat.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName}>{cat.name}</Text>
                  <Text style={styles.catType}>{cat.entry_type}</Text>
                </View>
                <TouchableOpacity onPress={() => openEditCategory(cat)} style={styles.catAction}>
                  <Ionicons name="pencil-outline" size={16} color="#6B7280" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCategory(cat)} style={styles.catAction}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.resetCatBtn} onPress={() => Alert.alert("Reset Categories", "Reset to default categories? This will remove all custom categories.", [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: resetToDefaults }])}>
            <Text style={styles.resetCatBtnText}>Reset to Defaults</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showCatModal} transparent animationType="slide" onRequestClose={() => setShowCatModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCat ? "Edit Category" : "New Category"}</Text>

            <Text style={styles.modalLabel}>Name</Text>
            <TextInput style={styles.modalInput} value={catName} onChangeText={setCatName} placeholder="e.g. Groceries" />

            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.typeRow}>
              <Pressable style={[styles.typeBtn, catType === "expense" && styles.typeBtnActive]} onPress={() => setCatType("expense")}>
                <Text style={[styles.typeBtnText, catType === "expense" && styles.typeBtnTextActive]}>Expense</Text>
              </Pressable>
              <Pressable style={[styles.typeBtn, catType === "income" && styles.typeBtnActive]} onPress={() => setCatType("income")}>
                <Text style={[styles.typeBtnText, catType === "income" && styles.typeBtnTextActive]}>Income</Text>
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {CATEGORY_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorSwatch, { backgroundColor: c }, catColor === c && styles.colorSwatchSelected]} onPress={() => setCatColor(c)} />
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCatModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleSaveCategory}>
                <Text style={styles.confirmBtnText}>{editingCat ? "Save" : "Add"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: "#F9FAFB" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937", marginTop: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingBottom: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4, marginTop: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" },
  testButton: { marginTop: 24, borderWidth: 2, borderColor: "#2563EB", borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 13, backgroundColor: "#EFF6FF" },
  testButtonText: { color: "#2563EB", fontSize: 16, fontWeight: "600" },
  buttonPressed: { opacity: 0.75 },
  resultBanner: { marginTop: 12, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1 },
  successBanner: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  errorBanner: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  resultText: { flex: 1, fontSize: 14 },
  saveButton: { marginTop: 20, backgroundColor: "#2563EB", borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 15 },
  saveButtonPressed: { backgroundColor: "#1D4ED8" },
  saveButtonDisabled: { backgroundColor: "#93C5FD" },
  saveButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  catSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingBottom: 6 },
  addCatBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#BFDBFE" },
  addCatBtnText: { color: "#2563EB", fontSize: 13, fontWeight: "600" },
  catList: { gap: 8, marginTop: 8 },
  catItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#F3F4F6" },
  catColorDot: { width: 14, height: 14, borderRadius: 7 },
  catName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  catType: { fontSize: 11, color: "#6B7280", textTransform: "capitalize" },
  catAction: { padding: 4 },
  resetCatBtn: { marginTop: 12, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  resetCatBtnText: { color: "#6B7280", fontSize: 13, fontWeight: "500", textDecorationLine: "underline" },
  logoutButton: { marginTop: 32, borderWidth: 2, borderColor: "#FCA5A5", borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 13, backgroundColor: "#FEF2F2" },
  logoutButtonText: { color: "#DC2626", fontSize: 16, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 4 },
  modalLabel: { fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  modalInput: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: { flex: 1, borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  typeBtnActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  typeBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  typeBtnTextActive: { color: "#2563EB" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3, borderColor: "#111827" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 16, fontWeight: "600", color: "#6B7280" },
  confirmBtn: { flex: 1, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
