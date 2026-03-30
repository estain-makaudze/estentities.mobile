// Categories screen – manage expense/income categories (offline-first)
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useCategories } from "../../store/categoriesStore";
import { useQueue } from "../../store/queueStore";
import { useSettings } from "../../store/settingsStore";

type EntryType = "expense" | "income";

export default function CategoriesScreen() {
  const { settings } = useSettings();
  const { isOnline } = useQueue();
  const {
    categories,
    isLoading,
    error,
    refreshCategories,
    addCategory,
    syncPending,
  } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntryType>("expense");
  const [saving, setSaving] = useState(false);

  const isConfigured = !!(
    settings.baseUrl && settings.db && settings.username && settings.password
  );

  const pendingCount = categories.filter(
    (c) => c.isLocal && c.syncStatus === "pending"
  ).length;
  const failedCount = categories.filter(
    (c) => c.isLocal && c.syncStatus === "failed"
  ).length;

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter a category name.");
      return;
    }
    if (
      categories.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      Alert.alert("Duplicate", `A category named "${trimmed}" already exists.`);
      return;
    }
    setSaving(true);
    try {
      await addCategory(trimmed, newType);
      setNewName("");
      setNewType("expense");
      setModalVisible(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "You need a connection to sync categories to Odoo.");
      return;
    }
    await syncPending();
    await refreshCategories();
  };

  return (
    <View style={styles.root}>
      {/* Status bar */}
      <View style={[styles.statusBar, isOnline ? styles.statusOnline : styles.statusOffline]}>
        <Ionicons
          name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={15}
          color={isOnline ? "#16A34A" : "#D97706"}
        />
        <Text style={[styles.statusText, { color: isOnline ? "#16A34A" : "#D97706" }]}>
          {isOnline ? "Online" : "Offline — new categories will sync when connected"}
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

      {/* Action row */}
      <View style={styles.actionRow}>
        <Text style={styles.listTitle}>
          {categories.length} {categories.length === 1 ? "Category" : "Categories"}
        </Text>
        <View style={styles.actionButtons}>
          {isOnline && isConfigured && (pendingCount > 0 || failedCount > 0) && (
            <TouchableOpacity style={styles.syncBtn} onPress={handleSync}>
              <Ionicons name="sync-outline" size={16} color="#2563EB" />
              <Text style={styles.syncBtnText}>Sync</Text>
            </TouchableOpacity>
          )}
          {isOnline && isConfigured && (
            <TouchableOpacity style={styles.refreshBtn} onPress={refreshCategories}>
              <Ionicons name="refresh-outline" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Not configured */}
      {!isConfigured && (
        <View style={styles.centered}>
          <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyText}>
            Configure your Odoo connection in <Text style={styles.link}>Settings</Text> to fetch categories.
          </Text>
          <Text style={styles.emptySubText}>
            You can still add categories below — they will sync to Odoo once configured.
          </Text>
        </View>
      )}

      {/* Category list */}
      {isLoading && categories.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={{ marginTop: 12, color: "#6B7280" }}>Loading categories…</Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshing={isLoading}
          onRefresh={isConfigured ? refreshCategories : undefined}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="pricetag-outline" size={36} color="#D1D5DB" />
              <Text style={styles.emptyHint}>
                No categories yet.{"\n"}Tap <Text style={styles.link}>+ New Category</Text> to add one.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, item.isLocal && styles.cardLocal]}>
              <View style={styles.cardLeft}>
                <View
                  style={[
                    styles.typeTag,
                    item.entry_type === "income"
                      ? styles.typeTagIncome
                      : styles.typeTagExpense,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeTagText,
                      item.entry_type === "income"
                        ? styles.typeTagTextIncome
                        : styles.typeTagTextExpense,
                    ]}
                  >
                    {item.entry_type}
                  </Text>
                </View>
                <Text style={styles.catName}>{item.name}</Text>
              </View>
              {item.isLocal && (
                <View style={styles.localBadge}>
                  <Ionicons
                    name={
                      item.syncStatus === "failed"
                        ? "alert-circle-outline"
                        : "time-outline"
                    }
                    size={14}
                    color={item.syncStatus === "failed" ? "#DC2626" : "#D97706"}
                  />
                  <Text
                    style={[
                      styles.localBadgeText,
                      item.syncStatus === "failed" && { color: "#DC2626" },
                    ]}
                  >
                    {item.syncStatus === "failed" ? "Sync failed" : "Pending sync"}
                  </Text>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* FAB – Add new category */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add category modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Category</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Fuel, Salary, Groceries…"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {(["expense", "income"] as EntryType[]).map((t) => (
                <Pressable
                  key={t}
                  style={[
                    styles.typeButton,
                    newType === t &&
                      (t === "income"
                        ? styles.typeButtonIncomeActive
                        : styles.typeButtonExpenseActive),
                  ]}
                  onPress={() => setNewType(t)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      newType === t && styles.typeButtonTextActive,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {!isOnline && (
              <View style={styles.offlineNote}>
                <Ionicons name="cloud-offline-outline" size={15} color="#D97706" />
                <Text style={styles.offlineNoteText}>
                  You're offline. The category will be saved locally and synced to Odoo when you reconnect.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  setNewName("");
                  setNewType("expense");
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.saveBtnPressed,
                  saving && styles.saveBtnDisabled,
                ]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {isOnline ? "Save to Odoo" : "Save Offline"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },

  // Status bar
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  statusOnline: { backgroundColor: "#F0FDF4" },
  statusOffline: { backgroundColor: "#FFFBEB" },
  statusText: { fontSize: 12, fontWeight: "500", flex: 1 },
  queueBadge: { backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  queueBadgeText: { fontSize: 11, color: "#92400E", fontWeight: "600" },

  // Action row
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listTitle: { fontSize: 14, fontWeight: "600", color: "#374151" },
  actionButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  syncBtnText: { color: "#2563EB", fontSize: 13, fontWeight: "600" },
  refreshBtn: {
    padding: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
  },

  // Error
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
  },
  errorText: { color: "#DC2626", flex: 1, fontSize: 13 },

  // Centered empty/loading
  centered: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 16,
  },
  emptyText: { marginTop: 12, color: "#6B7280", textAlign: "center", fontSize: 14, lineHeight: 20 },
  emptySubText: { marginTop: 6, color: "#9CA3AF", textAlign: "center", fontSize: 13 },
  link: { color: "#2563EB", fontWeight: "600" },

  // List
  list: { padding: 16, paddingBottom: 100 },
  emptyCard: { alignItems: "center", paddingVertical: 48 },
  emptyHint: { marginTop: 12, color: "#9CA3AF", textAlign: "center", fontSize: 14, lineHeight: 20 },

  // Category card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLocal: { borderWidth: 1, borderColor: "#FCD34D" },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  typeTag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeTagExpense: { backgroundColor: "#FEE2E2" },
  typeTagIncome: { backgroundColor: "#D1FAE5" },
  typeTagText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  typeTagTextExpense: { color: "#B91C1C" },
  typeTagTextIncome: { color: "#065F46" },
  catName: { fontSize: 15, fontWeight: "600", color: "#111827", flex: 1 },
  localBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  localBadgeText: { fontSize: 11, color: "#D97706", fontWeight: "500" },

  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  typeRow: { flexDirection: "row", gap: 10 },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  typeButtonExpenseActive: { backgroundColor: "#FEE2E2", borderColor: "#F87171" },
  typeButtonIncomeActive: { backgroundColor: "#D1FAE5", borderColor: "#34D399" },
  typeButtonText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  typeButtonTextActive: { color: "#111827" },

  offlineNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  offlineNoteText: { color: "#92400E", fontSize: 13, flex: 1 },

  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  saveBtn: {
    flex: 2,
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnPressed: { backgroundColor: "#1D4ED8" },
  saveBtnDisabled: { backgroundColor: "#93C5FD" },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
