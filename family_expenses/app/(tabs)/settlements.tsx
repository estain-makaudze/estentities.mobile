import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Alert, Pressable, View } from "react-native";
import { Avatar, Button, Card, EmptyState, Header, Money, Row, Screen, SectionHeader, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements } from "../../db/queries";
import { useTheme } from "../../theme";
import { computeDebtSummary, computeNetBalances } from "../../utils/balance";
import { friendlyDate } from "../../utils/dates";

/** Balances: who owes whom (minimised), settle up, payment history. */
export default function BalancesScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { userId } = useAuth();
  const { household, members, currency, userName, userColor } = useHousehold();
  const { deleteSettlement } = useApp();
  const version = useDataVersion();
  const hh = household?.id ?? "";

  const d = useMemo(() => {
    void version;
    const settlements = allSettlements(hh);
    const balances = computeNetBalances(allExpenses(hh), settlements, members.map((m) => m.id));
    return { balances, debts: computeDebtSummary(balances), settlements };
  }, [hh, members, version]);

  return (
    <Screen bottomInset={110}>
      <Header title="Balances" />

      <Card style={{ paddingVertical: 6 }}>
        {members.map((m) => {
          const b = d.balances[m.id] ?? 0;
          return (
            <Row key={m.id} style={{ paddingVertical: 10 }}>
              <Avatar name={m.name} color={m.color} size={38} />
              <T variant="bodyStrong" style={{ flex: 1 }}>{userName(m.id)}</T>
              <View style={{ alignItems: "flex-end" }}>
                {Math.abs(b) < 0.01 ? (
                  <T variant="caption">settled up</T>
                ) : (
                  <>
                    <Money amount={Math.abs(b)} currency={currency} color={b > 0 ? c.success : c.danger} />
                    <T variant="caption">{b > 0 ? "is owed" : "owes"}</T>
                  </>
                )}
              </View>
            </Row>
          );
        })}
      </Card>

      <SectionHeader title="Settle up" />
      {d.debts.length === 0 ? (
        <Card>
          <EmptyState icon="checkmark-done" title="Everyone is settled up 🎉" body="Shared expenses will show here when someone owes money." />
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

      <SectionHeader title="Payment history" action="Add" onAction={() => router.push("/add-settlement")} />
      <Card style={{ paddingVertical: 6 }}>
        {d.settlements.length === 0 ? (
          <T variant="caption" style={{ padding: 12, textAlign: "center" }}>No payments recorded yet.</T>
        ) : (
          d.settlements.map((s) => (
            <Row key={s.id} style={{ paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{userName(s.fromUserId)} → {userName(s.toUserId)}</T>
                <T variant="caption">{friendlyDate(s.date)}{s.note ? ` · ${s.note}` : ""}</T>
              </View>
              <Money amount={s.amount} currency={currency} />
              <Pressable
                hitSlop={10}
                onPress={() =>
                  Alert.alert("Delete payment?", "Balances will be recalculated.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteSettlement(s.id) },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={18} color={c.sub} />
              </Pressable>
            </Row>
          ))
        )}
      </Card>
    </Screen>
  );
}
