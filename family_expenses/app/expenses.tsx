import React, { useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../context/AppContext";
import { Expense } from "../types";

const CATEGORIES = [
  "All",
  "Groceries",
  "Utilities",
  "Rent",
  "Transport",
  "Dining",
  "Health",
  "Entertainment",
  "Other",
];

export default function ExpensesScreen() {
  const { state, deleteExpense } = useApp();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const getUserName = (id: string) =>
    state.users.find((u) => u.id === id)?.name ?? "Unknown";
  const getUserColor = (id: string) =>
    state.users.find((u) => u.id === id)?.color ?? "#888";

  const filtered =
    selectedCategory === "All"
      ? state.expenses
      : state.expenses.filter((e) => e.category === selectedCategory);

  const handleDelete = (expense: Expense) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete "${expense.description}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteExpense(expense.id),
        },
      ]
    );
  };

  const renderSplitInfo = (expense: Expense) => {
    if (!expense.splits || expense.splits.length === 0) {
      return (
        <Text style={styles.splitInfo}>
          No split — paid entirely by {getUserName(expense.paidBy)}
        </Text>
      );
    }
    const parts = expense.splits.map((s) => {
      const name = getUserName(s.userId);
      return `${name} ${s.percentage}%`;
    });
    return <Text style={styles.splitInfo}>Split: {parts.join(" · ")}</Text>;
  };

  const renderExpense = ({ item }: { item: Expense }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardDescription}>{item.description}</Text>
          <View style={styles.payerRow}>
            <View
              style={[
                styles.payerDot,
                { backgroundColor: getUserColor(item.paidBy) },
              ]}
            />
            <Text style={styles.payerName}>Paid by {getUserName(item.paidBy)}</Text>
          </View>
          {renderSplitInfo(item)}
          {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardAmount}>${item.amount.toFixed(2)}</Text>
          <Text style={styles.cardCategory}>{item.category}</Text>
          <Text style={styles.cardDate}>
            {new Date(item.date).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item)}
      >
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Category filter chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        style={styles.chipList}
        contentContainerStyle={styles.chipListContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.chip,
              item === selectedCategory && styles.chipActive,
            ]}
            onPress={() => setSelectedCategory(item)}
          >
            <Text
              style={[
                styles.chipText,
                item === selectedCategory && styles.chipTextActive,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Expenses list */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyText}>No expenses yet</Text>
          <Text style={styles.emptySubtext}>
            Tap the button below to add one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          renderItem={renderExpense}
          contentContainerStyle={styles.list}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/add-expense")}
      >
        <Text style={styles.fabText}>＋ Add Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  chipList: { flexGrow: 0, marginTop: 8 },
  chipListContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#E5E5EA",
  },
  chipActive: { backgroundColor: "#4A90D9" },
  chipText: { fontSize: 14, color: "#6C6C70" },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  list: { padding: 12, paddingBottom: 100 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row" },
  cardLeft: { flex: 1, marginRight: 8 },
  cardDescription: { fontSize: 16, fontWeight: "700", color: "#1C1C1E", marginBottom: 4 },
  payerRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  payerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  payerName: { fontSize: 13, color: "#6C6C70" },
  splitInfo: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  noteText: { fontSize: 12, color: "#8E8E93", fontStyle: "italic", marginTop: 2 },
  cardRight: { alignItems: "flex-end" },
  cardAmount: { fontSize: 20, fontWeight: "800", color: "#1C1C1E" },
  cardCategory: { fontSize: 12, color: "#4A90D9", marginTop: 2 },
  cardDate: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  deleteBtn: {
    marginTop: 10,
    backgroundColor: "#FFF0F0",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  deleteBtnText: { color: "#E74C3C", fontSize: 13, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  emptySubtext: { fontSize: 14, color: "#6C6C70", marginTop: 4 },

  fab: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: "#4A90D9",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
