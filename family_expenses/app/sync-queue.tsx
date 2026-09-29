import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Alert, View } from "react-native";
import { Button, Card, EmptyState, Header, Row, Screen, SectionHeader, T } from "../components/ui";
import { db } from "../db/database";
import { useDataVersion } from "../db/events";
import { useSyncStatus } from "../hooks/useSync";
import { discardFailed, retryFailed, syncNow } from "../services/syncEngine";
import { useTheme } from "../theme";

type Op = { op_id: string; label: string | null; entity: string; status: string; last_error: string | null; client_updated_at: string };

/** What's waiting to upload, and anything the server refused. */
export default function SyncQueueScreen() {
  const { c } = useTheme();
  const sync = useSyncStatus();
  const version = useDataVersion();
  const ops = useMemo(() => {
    void version;
    void sync.pending;
    void sync.failed;
    return db.getAllSync<Op>("SELECT op_id, label, entity, status, last_error, client_updated_at FROM outbox ORDER BY seq");
  }, [version, sync.pending, sync.failed]);
  const failed = ops.filter((o) => o.status === "failed");
  const pending = ops.filter((o) => o.status === "pending");

  return (
    <Screen>
      <Header title="Sync" />
      <Card>
        <Row>
          <Ionicons name={sync.isOnline ? "cloud-done-outline" : "cloud-offline-outline"} size={24} color={sync.isOnline ? c.success : c.sub} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{sync.isOnline ? "Connected" : "Offline"}</T>
            <T variant="caption">
              {sync.lastSyncAt ? `Last synced ${new Date(sync.lastSyncAt).toLocaleString()}` : "Not synced yet"}
            </T>
            {sync.lastError && <T variant="caption" color={c.danger}>{sync.lastError}</T>}
          </View>
        </Row>
        <Button title="Sync now" variant="dark" icon="sync" loading={sync.isSyncing} onPress={() => syncNow()} style={{ marginTop: 14 }} />
      </Card>

      {ops.length === 0 && <EmptyState icon="checkmark-done" title="Everything is synced" body="All your changes are on the server." />}

      {failed.length > 0 && (
        <>
          <SectionHeader title={`Couldn't sync · ${failed.length}`} />
          <Card style={{ gap: 12 }}>
            {failed.map((o) => (
              <View key={o.op_id}>
                <T variant="bodyStrong">{o.label ?? o.entity}</T>
                <T variant="caption" color={c.danger}>{o.last_error}</T>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Retry" onPress={retryFailed} style={{ flex: 1, paddingVertical: 12 }} />
              <Button
                title="Discard"
                variant="danger"
                style={{ flex: 1, paddingVertical: 12 }}
                onPress={() =>
                  Alert.alert("Discard these changes?", "They'll be replaced with the version on the server.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Discard", style: "destructive", onPress: discardFailed },
                  ])
                }
              />
            </View>
          </Card>
        </>
      )}

      {pending.length > 0 && (
        <>
          <SectionHeader title={`Waiting to upload · ${pending.length}`} />
          <Card style={{ paddingVertical: 6 }}>
            {pending.map((o) => (
              <Row key={o.op_id} style={{ paddingVertical: 8 }}>
                <Ionicons name="time-outline" size={18} color={c.sub} />
                <T variant="body" style={{ flex: 1 }} numberOfLines={1}>{o.label ?? o.entity}</T>
                <T variant="caption">{new Date(o.client_updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</T>
              </Row>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
