import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useSyncStatus } from "../hooks/useSync";
import { fonts, radius, useTheme } from "../theme";

/** Small status pill: offline / syncing / N waiting / N need attention. Hidden when all is synced. */
export function SyncBanner() {
  const router = useRouter();
  const { c } = useTheme();
  const { isOnline, isSyncing, pending, failed } = useSyncStatus();
  if (isOnline && !isSyncing && pending === 0 && failed === 0) return null;

  let bg = c.cardAlt;
  let fg = c.sub;
  let icon: React.ComponentProps<typeof Ionicons>["name"] = "cloud-offline-outline";
  let text = pending > 0 ? `Offline · ${pending} change${pending === 1 ? "" : "s"} will sync` : "Offline · all changes saved on this phone";
  if (failed > 0) {
    bg = c.dangerSoft; fg = c.danger; icon = "alert-circle";
    text = `${failed} change${failed === 1 ? "" : "s"} couldn't sync — tap to review`;
  } else if (isOnline && isSyncing) {
    bg = c.primarySoft; fg = c.primary; icon = "sync";
    text = "Syncing…";
  } else if (isOnline && pending > 0) {
    bg = c.primarySoft; fg = c.primary; icon = "cloud-upload-outline";
    text = `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
  }

  return (
    <Pressable
      onPress={() => router.push("/sync-queue")}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: bg, borderRadius: radius.pill,
               paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start", marginBottom: 12 }}
    >
      {isSyncing && isOnline && failed === 0 ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={16} color={fg} />}
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: 12.5 }}>{text}</Text>
    </Pressable>
  );
}
