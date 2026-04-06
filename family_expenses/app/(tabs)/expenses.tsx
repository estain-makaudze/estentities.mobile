import React, { useState, useMemo } from "react";
import {
  Alert,
  DimensionValue,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { Expense } from "../../types";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function startOfLastMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}
function endOfLastMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59);
}

export default function ExpensesScreen() {
  const { state, deleteExpense } = useApp();
  const { members: users } = useHousehold();
  const router = useRouter();

  const { expenses, customCategories } = state;
  const categoryNames = ["All", ...customCategories.map((c) => c.name)];
  const [selectedCategory, setSelectedCategory] = useState("All");

  const getUserName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? "Unknown";
  const getUserColor = (id: string) =>
    users.find((u) => u.id === id)?.color ?? "#888";

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfLastMonth(now);
  const lastMonthEnd = endOfLastMonth(now);

  const analytics = useMemo(() => {
    const thisMonthTotal = expenses
      .filter((e) => new Date(e.date) >= thisMonthStart)
      .reduce((s, e) => s + e.amount, 0);

    const lastMonthTotal = expenses
      .filter(
        (e) =>
          new Date(e.date) >= lastMonthStart && new Date(e.date) <= lastMonthEnd
      )
      .reduce((s, e) => s + e.amount, 0);

    const monthDiff =
      lastMonthTotal === 0
        ? null
        : ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;

    // Category breakdown for this month
    const catMap: Record<string, number> = {};
    expenses
      .filter((e) => new Date(e.date) >= thisMonthStart)
      .forEach((e) => {
        catMap[e.category] = (catMap[e.category] ?? 0) + e.amount;
      });

    const catBreakdown = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { thisMonthTotal, lastMonthTotal, monthDiff, catBreakdown };
  }, [expenses, thisMonthStart, lastMonthStart, lastMonthEnd]);

  const filtered =
    selectedCategory === "All"
      ? expenses
      : expenses.filter((e) => e.category === selectedCategory);

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
    const parts = expense.splits.map(
      (s) => `${getUserName(s.userId)} ${s.percentage}%`
    );
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
          {item.note ? (
            <Text style={styles.noteText}>{item.note}</Text>
          ) : null}
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
        style={styles.editBtn}
        onPress={() => router.push({ pathname: "/edit-expense", params: { id: item.id } })}
      >
        <Text style={styles.editBtnText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item)}
      >
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const { thisMonthTotal, lastMonthTotal, monthDiff, catBreakdown } = analytics;
  const trendUp = monthDiff !== null && monthDiff > 0;

  return (
    <View style={styles.container}>
      {/* Analytics header */}
      <ScrollView style={styles.analyticsScroll} contentContainerStyle={styles.analyticsContent}>
        {/* Month comparison */}
        <View style={styles.monthRow}>
          <View style={[styles.monthCard, { backgroundColor: "#4A90D9" }]}>
            <Text style={styles.monthCardLabel}>This Month</Text>
            <Text style={styles.monthCardAmount}>${thisMonthTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.monthCard, { backgroundColor: "#8E8E93" }]}>
            <Text style={styles.monthCardLabel}>Last Month</Text>
            <Text style={styles.monthCardAmount}>${lastMonthTotal.toFixed(2)}</Text>
          </View>
          {monthDiff !== null && (
            <View
              style={[
                styles.monthCard,
                { backgroundColor: trendUp ? "#E74C3C" : "#2ECC71" },
              ]}
            >
              <Text style={styles.monthCardLabel}>Change</Text>
              <Text style={styles.monthCardAmount}>
                {trendUp ? "+" : ""}
                {monthDiff.toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        {/* Category breakdown */}
        {catBreakdown.length > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>This Month by Category</Text>
            {catBreakdown.map(([cat, amt]) => {
              const pct = thisMonthTotal > 0 ? (amt / thisMonthTotal) * 100 : 0;
              const emoji = customCategories.find((c) => c.name === cat)?.emoji ?? "📦";
              return (
                <View key={cat} style={styles.breakdownRow}>
                  <Text style={styles.breakdownEmoji}>{emoji}</Text>
                  <Text style={styles.breakdownLabel}>{cat}</Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.barFill, { width: `${pct}%` as DimensionValue }]} />
                  </View>
                  <Text style={styles.breakdownAmt}>${amt.toFixed(0)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Category filter chips */}
      <FlatList
        horizontal
        data={categoryNames}
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
          <Text style={styles.emptySubtext}>Tap the button below to add one.</Text>
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

  analyticsScroll: { flexGrow: 0 },
  analyticsContent: { padding: 12, paddingBottom: 4 },

  monthRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  monthCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  monthCardLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginBottom: 4 },
  monthCardAmount: { color: "#fff", fontSize: 18, fontWeight: "800" },

  breakdownCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 4 },
  breakdownTitle: { fontSize: 14, fontWeight: "700", color: "#1C1C1E", marginBottom: 10 },
  breakdownRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  breakdownEmoji: { fontSize: 16, width: 24 },
  breakdownLabel: { fontSize: 13, color: "#1C1C1E", width: 90 },
  barContainer: { flex: 1, height: 8, backgroundColor: "#E5E5EA", borderRadius: 4, overflow: "hidden", marginHorizontal: 8 },
  barFill: { height: "100%", backgroundColor: "#4A90D9", borderRadius: 4 },
  breakdownAmt: { fontSize: 13, fontWeight: "600", color: "#1C1C1E", width: 52, textAlign: "right" },

  chipList: { flexGrow: 0, marginTop: 4 },
  chipListContent: { paddingHorizontal: 12, gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#E5E5EA" },
  chipActive: { backgroundColor: "#4A90D9" },
  chipText: { fontSize: 14, color: "#6C6C70" },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  list: { padding: 12, paddingBottom: 100 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
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
  deleteBtn: { marginTop: 10, backgroundColor: "#FFF0F0", borderRadius: 8, padding: 8, alignItems: "center" },
  deleteBtnText: { color: "#E74C3C", fontSize: 13, fontWeight: "600" },
  editBtn: { marginTop: 10, backgroundColor: "#EAF4FF", borderRadius: 8, padding: 8, alignItems: "center", marginBottom: 4 },
  editBtnText: { color: "#4A90D9", fontSize: 13, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  emptySubtext: { fontSize: 14, color: "#6C6C70", marginTop: 4 },

  fab: {
    position: "absolute", bottom: 24, left: 24, right: 24,
    backgroundColor: "#4A90D9", borderRadius: 14, padding: 16, alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
