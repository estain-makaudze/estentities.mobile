import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { Avatar, Button, Card, EmptyState, Header, IconTile, Money, Row, Screen, SectionHeader, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements } from "../../db/queries";
import { fonts, radius, useTheme } from "../../theme";
import { computeDebtSummary, computeNetBalances } from "../../utils/balance";
import { friendlyDate, monthKey, monthLong, today } from "../../utils/dates";
import { formatMoney } from "../../utils/format";

/** Payments (settle-ups): suggested payments, record one, and the full searchable history. */
export default function PaymentsScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { userId } = useAuth();
  const { household, members, currency, userName, userColor } = useHousehold();
  const { deleteSettlement } = useApp();
  const version = useDataVersion();
  const hh = household?.id ?? "";
  const [search, setSearch] = useState("");

  const d = useMemo(() => {
    void version;
    const settlements = allSettlements(hh);
    const balances = computeNetBalances(allExpenses(hh), settlements, members.map((m) => m.id));
    const month = monthKey(today());
    return {
      debts: computeDebtSummary(balances),
      settlements,
      total: settlements.reduce((a, s) => a + s.amount, 0),
      thisMonth: settlements.filter((s) => monthKey(s.date) === month).reduce((a, s) => a + s.amount, 0),
    };
  }, [hh, members, version]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return d.settlements;
    const digits = q.replace(/[^0-9.]/g, "");
    return d.settlements.filter(
      (s) =>
        (!!digits && s.amount.toFixed(2).includes(digits)) ||
        [s.note, userName(s.fromUserId), userName(s.toUserId), s.date].some((h) => h?.toLowerCase().includes(q))
    );
  }, [d.settlements, search, userName]);

  let lastMonth = "";

  return (
    <Screen bottomInset={110}>
      <Header
        title="Payments"
        right={
          <Pressable hitSlop={10} onPress={() => router.push("/add-settlement")}>
            <Ionicons name="add-circle" size={28} color={c.primary} />
          </Pressable>
        }
      />

      <Card style={{ flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          <T variant="caption">Paid back this month</T>
          <Money amount={d.thisMonth} currency={currency} variant="h2" />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <T variant="caption">All time · {d.settlements.length} payments</T>
          <Money amount={d.total} currency={currency} variant="h2" />
        </View>
      </Card>

      {/* Suggested settle-ups */}
      <SectionHeader title="Settle up" action="Ledger" onAction={() => router.push("/(tabs)/balance")} />
      {d.debts.length === 0 ? (
        <Card>
          <Row>
            <IconTile icon="checkmark-done" color={c.success} size={40} />
            <T variant="bodyStrong" style={{ flex: 1 }}>Everyone is settled up 🎉</T>
          </Row>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {d.debts.map((debt) => (
            <Card key={`${debt.fromUserId}-${debt.toUserId}`}>
              <Row>
                <Avatar name={userName(debt.fromUserId)} color={userColor(debt.fromUserId)} size={34} />
                <Ionicons name="arrow-forward" size={16} color={c.sub} />
                <Avatar name={userName(debt.toUserId)} color={userColor(debt.toUserId)} size={34} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {userName(debt.fromUserId)} {debt.fromUserId === userId ? "owe" : "owes"} {userName(debt.toUserId)}
                  </T>
                  <Money amount={debt.amount} currency={currency} variant="h3" />
                </View>
              </Row>
              <Button
                title={debt.fromUserId === userId ? "Pay now" : "Record payment"}
                variant={debt.fromUserId === userId ? "primary" : "dark"}
                style={{ marginTop: 12, paddingVertical: 12 }}
                onPress={() =>
                  router.push({
                    pathname: "/add-settlement",
                    params: { fromUserId: debt.fromUserId, toUserId: debt.toUserId, suggestedAmount: debt.amount.toFixed(2) },
                  })
                }
              />
            </Card>
          ))}
        </View>
      )}

      {/* History */}
      <SectionHeader title="Payment history" />
      <View
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderRadius: radius.md,
                 paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: c.line, marginBottom: 8 }}
      >
        <Ionicons name="search" size={18} color={c.sub} />
        <TextInput
          placeholder="Search person, note or amount"
          placeholderTextColor={c.sub}
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, paddingVertical: 12, fontFamily: fonts.medium, fontSize: 15, color: c.ink }}
        />
      </View>

      {list.length === 0 ? (
        <EmptyState icon="swap-horizontal" title={search ? "No matching payments" : "No payments yet"} />
      ) : (
        list.map((s) => {
          const m = monthKey(s.date);
          const header = m !== lastMonth ? monthLong(m) : null;
          lastMonth = m;
          return (
            <View key={s.id}>
              {header && <T variant="label" muted style={{ marginTop: 12, marginBottom: 6 }}>{header}</T>}
              <View style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: 6 }}>
                <Row style={{ paddingVertical: 12 }}>
                  <IconTile icon="swap-horizontal" color={c.success} size={40} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong" numberOfLines={1}>{userName(s.fromUserId)} → {userName(s.toUserId)}</T>
                    <T variant="caption" numberOfLines={1}>{friendlyDate(s.date)}{s.note ? ` · ${s.note}` : ""}</T>
                  </View>
                  <Money amount={s.amount} currency={currency} />
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      Alert.alert("Delete payment?", `${formatMoney(s.amount, currency)} from ${userName(s.fromUserId)} — balances will be recalculated.`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteSettlement(s.id) },
                      ])
                    }
                  >
                    <Ionicons name="trash-outline" size={18} color={c.sub} />
                  </Pressable>
                </Row>
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}
