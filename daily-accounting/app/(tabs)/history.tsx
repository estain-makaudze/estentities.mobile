// History screen – shows recent draft entries pulled from Odoo
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate } from "../../services/odooApi";
import { callKw } from "../../services/odooClient";
import { useSettings } from "../../store/settingsStore";
import { OdooDailyEntry } from "../../types/odoo";

export default function HistoryScreen() {
  const { settings, isLoaded } = useSettings();
  const [entries, setEntries] = useState<OdooDailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured =
    settings.baseUrl && settings.db && settings.username && settings.password;

  const loadEntries = useCallback(async () => {
    if (!isConfigured || !isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const uid = await authenticate(settings);
      const results = await callKw<OdooDailyEntry[]>(
        settings,
        uid,
        "daily.entry",
        "search_read",
        [[["state", "=", "draft"]]],
        {
          fields: ["id", "name", "date", "category_id", "amount", "currency_id", "state"],
          order: "date desc, id desc",
          limit: 50,
        }
      );
      setEntries(results || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [isConfigured, isLoaded, settings]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  if (!isLoaded || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#6B7280" }}>Loading entries…</Text>
      </View>
    );
  }

  if (!isConfigured) {
    return (
      <View style={styles.centered}>
        <Ionicons name="settings-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>Configure Odoo in Settings first.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={[styles.emptyText, { color: "#EF4444" }]}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadEntries}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="document-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>No draft entries found.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadEntries}>
          <Text style={styles.retryText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ padding: 16 }}
      refreshing={loading}
      onRefresh={loadEntries}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => {
        const catName = Array.isArray(item.category_id)
          ? item.category_id[1]
          : String(item.category_id);
        const curName = Array.isArray(item.currency_id)
          ? item.currency_id[1]
          : String(item.currency_id);
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardCategory}>{catName}</Text>
              <Text style={styles.cardAmount}>
                {curName} {item.amount.toFixed(2)}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardDate}>{item.date}</Text>
              <View
                style={[
                  styles.badge,
                  item.state === "draft" ? styles.badgeDraft : styles.badgeSummarised,
                ]}
              >
                <Text style={styles.badgeText}>{item.state}</Text>
              </View>
            </View>
            {item.name ? (
              <Text style={styles.cardNote} numberOfLines={1}>
                {item.name}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F9FAFB",
  },
  emptyText: {
    marginTop: 12,
    color: "#6B7280",
    textAlign: "center",
    fontSize: 15,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardCategory: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  cardAmount: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2563EB",
  },
  cardDate: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  cardNote: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  badgeDraft: { backgroundColor: "#DBEAFE" },
  badgeSummarised: { backgroundColor: "#D1FAE5" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#374151" },
});


