import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../../context/AppContext";
import { computeNetBalances, computeDebtSummary, totalPaidByUser } from "../../utils/balance";

export default function DashboardScreen() {
  const { state } = useApp();
  const router = useRouter();
  const { users, expenses, settlements, loaded } = state;

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
        <Text style={styles.emptyTitle}>Welcome to Family Expenses</Text>
        <Text style={styles.emptySubtitle}>
          Start by adding the people who share expenses together.
        </Text>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push("/users")}
        >
          <Text style={styles.ctaButtonText}>Add Users</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const userIds = users.map((u) => u.id);
  const balances = computeNetBalances(expenses, settlements, userIds);
  const debts = computeDebtSummary(balances);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const getUserName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? "Unknown";
  const getUserColor = (id: string) =>
    users.find((u) => u.id === id)?.color ?? "#888";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Expenses</Text>
        <Text style={styles.summaryAmount}>${totalExpenses.toFixed(2)}</Text>
        <Text style={styles.summaryMeta}>
          {expenses.length} expense{expenses.length !== 1 ? "s" : ""} · {users.length} {users.length !== 1 ? "people" : "person"}
        </Text>
      </View>

      {/* Per-user totals */}
      <Text style={styles.sectionTitle}>Who Paid What</Text>
      {users.map((user) => {
        const paid = totalPaidByUser(expenses, user.id);
        return (
          <View key={user.id} style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: user.color }]}>
              <Text style={styles.avatarText}>{user.name[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userAmount}>${paid.toFixed(2)}</Text>
          </View>
        );
      })}

      {/* Settlements needed */}
      <Text style={styles.sectionTitle}>Who Owes Whom</Text>
      {debts.length === 0 ? (
        <View style={styles.settledBadge}>
          <Text style={styles.settledText}>✅ All settled up!</Text>
        </View>
      ) : (
        debts.map((debt, i) => (
          <View key={i} style={styles.debtCard}>
            <View style={styles.debtRow}>
              <View
                style={[styles.debtAvatar, { backgroundColor: getUserColor(debt.fromUserId) }]}
              >
                <Text style={styles.avatarText}>
                  {getUserName(debt.fromUserId)[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.debtMiddle}>
                <Text style={styles.debtLabel}>
                  <Text style={styles.debtName}>{getUserName(debt.fromUserId)}</Text>
                  {" owes "}
                  <Text style={styles.debtName}>{getUserName(debt.toUserId)}</Text>
                </Text>
                <Text style={styles.debtAmount}>${debt.amount.toFixed(2)}</Text>
              </View>
              <View
                style={[styles.debtAvatar, { backgroundColor: getUserColor(debt.toUserId) }]}
              >
                <Text style={styles.avatarText}>
                  {getUserName(debt.toUserId)[0].toUpperCase()}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.settleButton}
              onPress={() =>
                router.push({
                  pathname: "/add-settlement",
                  params: {
                    fromUserId: debt.fromUserId,
                    toUserId: debt.toUserId,
                    suggestedAmount: debt.amount.toFixed(2),
                  },
                })
              }
            >
              <Text style={styles.settleButtonText}>Record Settlement</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: "#4A90D9" }]}
          onPress={() => router.push("/add-expense")}
        >
          <Text style={styles.quickBtnText}>+ Add Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: "#2ECC71" }]}
          onPress={() => router.push("/add-settlement")}
        >
          <Text style={styles.quickBtnText}>+ Record Payment</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#1C1C1E", marginBottom: 8, textAlign: "center" },
  emptySubtitle: { fontSize: 15, color: "#6C6C70", textAlign: "center", marginBottom: 24, lineHeight: 22 },
  ctaButton: { backgroundColor: "#4A90D9", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  ctaButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  summaryCard: {
    backgroundColor: "#4A90D9",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  summaryLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 4 },
  summaryAmount: { color: "#fff", fontSize: 40, fontWeight: "800" },
  summaryMeta: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },

  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#1C1C1E", marginTop: 8, marginBottom: 10 },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  userName: { flex: 1, fontSize: 16, color: "#1C1C1E" },
  userAmount: { fontSize: 16, fontWeight: "600", color: "#1C1C1E" },

  settledBadge: {
    backgroundColor: "#E8FAF0",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  settledText: { fontSize: 16, color: "#2ECC71", fontWeight: "600" },

  debtCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  debtRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  debtAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  debtMiddle: { flex: 1, alignItems: "center" },
  debtLabel: { fontSize: 14, color: "#6C6C70", textAlign: "center" },
  debtName: { fontWeight: "700", color: "#1C1C1E" },
  debtAmount: { fontSize: 22, fontWeight: "800", color: "#E74C3C", marginTop: 2 },
  settleButton: {
    backgroundColor: "#E8FAF0",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  settleButtonText: { color: "#2ECC71", fontWeight: "600", fontSize: 14 },

  quickActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  quickBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  quickBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

