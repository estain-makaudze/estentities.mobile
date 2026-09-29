import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { TransactionRow } from "../../components/TransactionRow";
import { Avatar, Card, EmptyState, Money, ProgressBar, QuickAction, Screen, SectionHeader, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements, recentActivity, totalBetween } from "../../db/queries";
import { radius, useTheme } from "../../theme";
import { computeNetBalances } from "../../utils/balance";
import { monthKey, monthRange, today } from "../../utils/dates";
import { formatMoney } from "../../utils/format";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { user, userId } = useAuth();
  const { household, members, currency } = useHousehold();
  const { budgets } = useApp();
  const version = useDataVersion();
  const hh = household?.id ?? "";

  const data = useMemo(() => {
    void version;
    const month = monthKey(today());
    const { from, to } = monthRange(month);
    const spent = totalBetween(hh, from, to);
    const balances = computeNetBalances(allExpenses(hh), allSettlements(hh), members.map((m) => m.id));
    return { spent, myBalance: userId ? balances[userId] ?? 0 : 0, recent: recentActivity(hh, 8) };
  }, [hh, members, userId, version]);

  const totalBudget = budgets.find((b) => b.categoryId === null)?.amount ?? null;
  const firstName = user?.name.split(" ")[0] ?? "there";
  const bal = data.myBalance;

  return (
    <Screen bottomInset={110}>
      <View style={{ paddingTop: insets.top + 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={user?.name ?? "?"} color={user?.color ?? c.primary} size={48} />
        <View style={{ flex: 1 }}>
          <T variant="caption">Hello</T>
          <T variant="h1" numberOfLines={1}>{firstName}</T>
        </View>
        <Pressable hitSlop={10} onPress={() => router.push("/(tabs)/household")}>
          <View style={{ backgroundColor: c.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T variant="caption" color={c.ink} numberOfLines={1} style={{ maxWidth: 130 }}>{household?.name}</T>
          </View>
        </Pressable>
      </View>

      <View style={{ marginTop: 16 }}>
        <SyncBanner />
      </View>

      {/* Headline */}
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <T variant="caption">Family spending this month</T>
        <Money amount={data.spent} currency={currency} variant="display" style={{ marginTop: 6 }} />
        {totalBudget ? (
          <View style={{ width: "70%", marginTop: 12, gap: 6 }}>
            <ProgressBar ratio={data.spent / totalBudget} />
            <T variant="caption" style={{ textAlign: "center" }}>
              {data.spent <= totalBudget
                ? `${formatMoney(totalBudget - data.spent, currency)} left of ${formatMoney(totalBudget, currency)}`
                : `${formatMoney(data.spent - totalBudget, currency)} over the ${formatMoney(totalBudget, currency)} budget`}
            </T>
          </View>
        ) : (
          <Pressable onPress={() => router.push({ pathname: "/budget-form", params: { category: "total" } })}>
            <T variant="caption" color={c.primary} style={{ marginTop: 8 }}>+ Set a monthly budget</T>
          </Pressable>
        )}
      </View>

      {/* Quick actions */}
      <View style={{ flexDirection: "row", marginTop: 28 }}>
        <QuickAction icon="add-circle-outline" label="Expense" onPress={() => router.push("/add-expense")} />
        <QuickAction icon="swap-horizontal" label="Settle up" onPress={() => router.push("/add-settlement")} />
        <QuickAction icon="repeat" label="Bills" onPress={() => router.push("/recurring")} />
        <QuickAction icon="grid-outline" label="More" onPress={() => router.push("/(tabs)/settings")} />
      </View>

      {/* My balance */}
      {members.length > 1 && (
        <Pressable onPress={() => router.push("/(tabs)/settlements")}>
          <Card style={{ marginTop: 24, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center",
                backgroundColor: Math.abs(bal) < 0.01 ? c.cardAlt : bal > 0 ? c.successSoft : c.dangerSoft,
              }}
            >
              <Ionicons
                name={Math.abs(bal) < 0.01 ? "checkmark" : bal > 0 ? "arrow-down" : "arrow-up"}
                size={22}
                color={Math.abs(bal) < 0.01 ? c.sub : bal > 0 ? c.success : c.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="caption">{Math.abs(bal) < 0.01 ? "All settled" : bal > 0 ? "You are owed" : "You owe"}</T>
              <Money amount={Math.abs(bal)} currency={currency} variant="h2" />
            </View>
            <T variant="caption" color={c.primary}>Balances ›</T>
          </Card>
        </Pressable>
      )}

      <SectionHeader title="Last Transactions" action="See All" onAction={() => router.push("/(tabs)/expenses")} />
      <Card style={{ paddingVertical: 6 }}>
        {data.recent.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No expenses yet"
            body="Tap + to add your first family expense. It's saved on this phone right away."
          />
        ) : (
          data.recent.map((a) => <TransactionRow key={a.item.id} activity={a} />)
        )}
      </Card>
    </Screen>
  );
}
