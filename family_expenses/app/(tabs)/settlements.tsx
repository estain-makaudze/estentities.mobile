import React from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { Settlement } from "../../types";

export default function SettlementsScreen() {
  const { state, deleteSettlement } = useApp();
  const { members: users } = useHousehold();
  const router = useRouter();
  const { settlements } = state;

  const getUserName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? "Unknown";
  const getUserColor = (id: string) =>
    users.find((u) => u.id === id)?.color ?? "#888";

  const handleDelete = (s: Settlement) => {
    Alert.alert(
      "Delete Settlement",
      "Are you sure you want to remove this payment record?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteSettlement(s.id) },
      ]
    );
  };

  const renderItem = ({ item }: { item: Settlement }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: getUserColor(item.fromUserId) }]}>
          <Text style={styles.avatarText}>{getUserName(item.fromUserId)[0].toUpperCase()}</Text>
        </View>
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>→</Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: getUserColor(item.toUserId) }]}>
          <Text style={styles.avatarText}>{getUserName(item.toUserId)[0].toUpperCase()}</Text>
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.cardNames}>
            {getUserName(item.fromUserId)} paid {getUserName(item.toUserId)}
          </Text>
          {item.note ? <Text style={styles.cardNote}>{item.note}</Text> : null}
          <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.cardAmount}>${item.amount.toFixed(2)}</Text>
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
        <Text style={styles.deleteBtnText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {settlements.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💸</Text>
          <Text style={styles.emptyTitle}>No Settlements Yet</Text>
          <Text style={styles.emptySubtitle}>
            Record payments between household members to reduce outstanding balances.
          </Text>
        </View>
      ) : (
        <FlatList
          data={settlements}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push("/add-settlement")}>
        <Text style={styles.fabText}>＋ Record Payment</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  list: { padding: 12, paddingBottom: 100 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  arrow: { marginHorizontal: 6 },
  arrowText: { fontSize: 20, color: "#2ECC71" },
  cardMid: { flex: 1, marginHorizontal: 10 },
  cardNames: { fontSize: 14, fontWeight: "600", color: "#1C1C1E" },
  cardNote: { fontSize: 12, color: "#8E8E93", fontStyle: "italic", marginTop: 2 },
  cardDate: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  cardAmount: { fontSize: 20, fontWeight: "800", color: "#2ECC71" },
  deleteBtn: { marginTop: 10, backgroundColor: "#FFF0F0", borderRadius: 8, padding: 8, alignItems: "center" },
  deleteBtnText: { color: "#E74C3C", fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#1C1C1E", marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: "#6C6C70", textAlign: "center", lineHeight: 22 },
  fab: {
    position: "absolute", bottom: 24, left: 24, right: 24,
    backgroundColor: "#2ECC71", borderRadius: 14, padding: 16, alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
