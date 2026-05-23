// -*- coding: utf-8 -*-
// Sync queue inspector: pending / syncing / failed Odoo operations, with
// manual sync, retry and discard. Reached from <SyncStatusBanner />.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { QueueOp, useSyncQueue } from "../store/syncQueue";

const STATUS_META: Record<
  QueueOp["status"],
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#1D4ED8", bg: "#DBEAFE" },
  syncing: { label: "Syncing", color: "#92400E", bg: "#FEF3C7" },
  failed: { label: "Failed", color: "#B91C1C", bg: "#FEE2E2" },
};

function OpRow({ op, onRemove }: { op: QueueOp; onRemove: (id: string) => void }) {
  const meta = STATUS_META[op.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.opLabel} numberOfLines={2}>
          {op.label}
        </Text>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>
        {op.payload.type}
        {op.attempts > 0 ? ` · ${op.attempts} attempt${op.attempts > 1 ? "s" : ""}` : ""}
        {" · "}
        {new Date(op.createdAt).toLocaleString()}
      </Text>
      {op.lastError ? (
        <Text style={styles.error} numberOfLines={4}>
          {op.needsAttention ? "⚠ " : ""}
          {op.lastError}
        </Text>
      ) : null}
      {op.status !== "syncing" && (
        <TouchableOpacity
          style={styles.discard}
          onPress={() =>
            Alert.alert(
              "Discard action?",
              "This queued change will not be sent to Odoo. This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Discard",
                  style: "destructive",
                  onPress: () => onRemove(op.id),
                },
              ]
            )
          }
        >
          <Ionicons name="trash-outline" size={15} color="#B91C1C" />
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SyncQueueScreen() {
  const router = useRouter();
  const {
    queue,
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    syncNow,
    retryFailed,
    clearFailed,
    removeOp,
  } = useSyncQueue();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Queue</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <View style={styles.statusDot}>
          <Ionicons
            name={isOnline ? "wifi" : "cloud-offline-outline"}
            size={16}
            color={isOnline ? "#16A34A" : "#6B7280"}
          />
          <Text style={styles.summaryText}>
            {isOnline ? "Online" : "Offline"} · {pendingCount} pending ·{" "}
            {failedCount} failed
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          disabled={isSyncing || !isOnline}
          onPress={() => syncNow()}
        >
          <Text style={styles.btnPrimaryText}>
            {isSyncing ? "Syncing…" : "Sync now"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          disabled={failedCount === 0}
          onPress={() => retryFailed()}
        >
          <Text style={styles.btnGhostText}>Retry failed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          disabled={failedCount === 0}
          onPress={() =>
            Alert.alert("Clear failed?", "Remove all failed actions from the queue?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", style: "destructive", onPress: () => clearFailed() },
            ])
          }
        >
          <Text style={styles.btnGhostText}>Clear failed</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={queue}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <OpRow op={item} onRemove={removeOp} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#16A34A" />
            <Text style={styles.emptyText}>Everything is synced</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  statusDot: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryText: { color: "#374151", fontSize: 13, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: "#2563EB" },
  btnPrimaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  btnGhost: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB" },
  btnGhostText: { color: "#374151", fontWeight: "600", fontSize: 13 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  opLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  meta: { fontSize: 11, color: "#6B7280" },
  error: { fontSize: 12, color: "#B91C1C", marginTop: 2 },
  discard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  discardText: { color: "#B91C1C", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: "#6B7280", fontSize: 15, fontWeight: "600" },
});
