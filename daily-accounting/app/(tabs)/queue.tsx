// Queue screen – view pending / failed offline entries and manage sync
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { QueueItem, useQueue } from "../../store/queueStore";

const STATUS_CONFIG = {
  pending: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "time-outline" as const, label: "Pending" },
  syncing: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "sync-outline" as const, label: "Syncing…" },
  failed:  { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "alert-circle-outline" as const, label: "Failed" },
};

function QueueCard({ item }: { item: QueueItem }) {
  const cfg = STATUS_CONFIG[item.status];
  return (
    <View style={[styles.card, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
      <View style={styles.cardRow}>
        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
        <Text style={[styles.cardCategory, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={styles.cardAmount}>{item.currencyCode} {item.amount.toFixed(2)}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardName}>{item.categoryName}</Text>
        <Text style={styles.cardDate}>{item.date}</Text>
      </View>
      {item.note ? <Text style={styles.cardNote} numberOfLines={1}>{item.note}</Text> : null}
      {item.errorMsg ? (
        <Text style={styles.cardError} numberOfLines={2}>⚠ {item.errorMsg}</Text>
      ) : null}
    </View>
  );
}

export default function QueueScreen() {
  const { queue, isOnline, isSyncing, syncNow, clearFailed, retryFailed } = useQueue();

  const pending  = queue.filter((i) => i.status === "pending");
  const syncing  = queue.filter((i) => i.status === "syncing");
  const failed   = queue.filter((i) => i.status === "failed");
  const allItems = [...syncing, ...pending, ...failed];

  return (
    <View style={styles.container}>
      {/* Header summary */}
      <View style={[styles.summaryBar, isOnline ? styles.summaryOnline : styles.summaryOffline]}>
        <Ionicons
          name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={16} color={isOnline ? "#16A34A" : "#D97706"}
        />
        <Text style={[styles.summaryText, { color: isOnline ? "#16A34A" : "#D97706" }]}>
          {isSyncing ? "Syncing…" : isOnline ? "Online" : "Offline"}
          {" · "}
          {pending.length + syncing.length} pending · {failed.length} failed
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.syncBtn, (!isOnline || isSyncing || allItems.length === 0) && styles.btnDisabled]}
          onPress={syncNow}
          disabled={!isOnline || isSyncing || allItems.length === 0}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Ionicons name="sync-outline" size={16} color="#2563EB" />
          )}
          <Text style={styles.syncBtnText}>Sync Now</Text>
        </TouchableOpacity>

        {failed.length > 0 && (
          <>
            <TouchableOpacity style={[styles.actionBtn, styles.retryBtn]} onPress={retryFailed}>
              <Ionicons name="refresh-outline" size={16} color="#D97706" />
              <Text style={styles.retryBtnText}>Retry Failed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={clearFailed}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.clearBtnText}>Clear Failed</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {allItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={52} color="#86EFAC" />
          <Text style={styles.emptyTitle}>All synced!</Text>
          <Text style={styles.emptyText}>No pending entries in the queue.</Text>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <QueueCard item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  summaryBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  summaryOnline: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  summaryOffline: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" },
  summaryText: { fontSize: 13, fontWeight: "500" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, paddingBottom: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  btnDisabled: { opacity: 0.4 },
  syncBtn: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  syncBtnText: { color: "#2563EB", fontWeight: "600", fontSize: 14 },
  retryBtn: { borderColor: "#D97706", backgroundColor: "#FFFBEB" },
  retryBtnText: { color: "#D97706", fontWeight: "600", fontSize: 14 },
  clearBtn: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  clearBtnText: { color: "#DC2626", fontWeight: "600", fontSize: 14 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "700", color: "#111827" },
  emptyText: { marginTop: 6, fontSize: 14, color: "#6B7280", textAlign: "center" },
  card: { borderRadius: 12, padding: 14, borderWidth: 1.5 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  cardCategory: { fontSize: 13, fontWeight: "600", flex: 1 },
  cardAmount: { fontSize: 16, fontWeight: "700", color: "#111827" },
  cardName: { fontSize: 15, fontWeight: "600", color: "#1F2937", flex: 1, marginTop: 4 },
  cardDate: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  cardNote: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  cardError: { fontSize: 12, color: "#DC2626", marginTop: 6, fontStyle: "italic" },
});


