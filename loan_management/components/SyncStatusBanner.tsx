// -*- coding: utf-8 -*-
// Compact, tappable status strip for the offline sync queue.
// Drop <SyncStatusBanner /> near the top of any screen. It hides itself when
// the device is online and the queue is empty.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSyncQueue } from "../store/syncQueue";

export function SyncStatusBanner() {
  const router = useRouter();
  const { isOnline, isSyncing, pendingCount, failedCount } = useSyncQueue();

  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  let bg = "#1E3A8A";
  let icon: keyof typeof Ionicons.glyphMap = "cloud-upload-outline";
  let text = "";

  if (failedCount > 0) {
    bg = "#B91C1C";
    icon = "alert-circle-outline";
    text = `${failedCount} action${failedCount > 1 ? "s" : ""} need attention`;
  } else if (!isOnline) {
    bg = "#6B7280";
    icon = "cloud-offline-outline";
    text =
      pendingCount > 0
        ? `Offline — ${pendingCount} change${pendingCount > 1 ? "s" : ""} will sync`
        : "Offline";
  } else if (isSyncing) {
    bg = "#1D4ED8";
    text = `Syncing ${pendingCount} change${pendingCount > 1 ? "s" : ""}…`;
  } else {
    bg = "#1E3A8A";
    text = `${pendingCount} change${pendingCount > 1 ? "s" : ""} pending sync`;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.bar, { backgroundColor: bg }]}
      onPress={() => router.push("/sync-queue")}
    >
      {isSyncing && failedCount === 0 ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={icon} size={16} color="#FFFFFF" />
      )}
      <Text style={styles.text}>{text}</Text>
      <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", flex: 1 },
});
