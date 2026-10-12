import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, View } from "react-native";
import { DonutChart } from "../../components/charts";
import { Button, Card, Header, IconTile, Money, ProgressBar, Screen, SectionHeader, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { categoryTotals, totalBetween } from "../../db/queries";
import { PALETTE, useTheme } from "../../theme";
import { monthKey, monthLong, monthRange, parseDate, today } from "../../utils/dates";
import { formatMoney } from "../../utils/format";

export default function BudgetsScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { household, currency } = useHousehold();
  const { categories, budgets } = useApp();
  const version = useDataVersion();
  const hh = household?.id ?? "";
  const month = monthKey(today());

  const d = useMemo(() => {
    void version;
    const { from, to, days } = monthRange(month);
    const spentBy = new Map(categoryTotals(hh, from, to).map((t) => [t.categoryId, t.total]));
    return {
      total: totalBetween(hh, from, to),
      spentBy,
      daysLeft: days - parseDate(today()).getDate() + 1,
    };
  }, [hh, month, version]);

  const totalBudget = budgets.find((b) => b.categoryId === null) ?? null;
  const budgetFor = (id: string) => budgets.find((b) => b.categoryId === id) ?? null;
  const withBudget = categories.filter((cat) => budgetFor(cat.id));
  const without = categories.filter((cat) => !budgetFor(cat.id));
  const edit = (category: string) => router.push({ pathname: "/budget-form", params: { category } });

  const ratio = totalBudget ? d.total / totalBudget.amount : 0;
  const ringColor = ratio >= 1 ? c.danger : ratio >= 0.8 ? c.warning : c.primary;

  return (
    <Screen bottomInset={110}>
      <Header title="Budgets" />

      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        <T variant="caption">{monthLong(month)}</T>
        {totalBudget ? (
          <>
            <View style={{ marginVertical: 16 }}>
              <DonutChart
                size={190}
                stroke={20}
                segments={[
                  { value: Math.min(d.total, totalBudget.amount), color: ringColor },
                  { value: Math.max(0, totalBudget.amount - d.total), color: "transparent" },
                ]}
                centerValue={`${Math.round(ratio * 100)}%`}
                centerLabel="of budget used"
              />
            </View>
            <View style={{ flexDirection: "row", width: "100%" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <T variant="caption">Spent</T>
                <Money amount={d.total} currency={currency} variant="h3" />
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <T variant="caption">{d.total > totalBudget.amount ? "Over by" : "Left"}</T>
                <Money
                  amount={Math.abs(totalBudget.amount - d.total)}
                  currency={currency}
                  variant="h3"
                  color={d.total > totalBudget.amount ? c.danger : c.success}
                />
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <T variant="caption">Per day left</T>
                <Money
                  amount={Math.max(0, (totalBudget.amount - d.total) / d.daysLeft)}
                  currency={currency}
                  variant="h3"
                />
              </View>
            </View>
            <Button title="Edit family budget" variant="ghost" onPress={() => edit("total")} style={{ marginTop: 8 }} />
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 8, marginTop: 8 }}>
            <Money amount={d.total} currency={currency} variant="display" />
            <T variant="caption">spent so far — no family budget yet</T>
            <Button title="Set a monthly budget" variant="dark" onPress={() => edit("total")} style={{ marginTop: 12 }} />
          </View>
        )}
      </Card>

      {withBudget.length > 0 && <SectionHeader title="Category budgets" />}
      <View style={{ gap: 10 }}>
        {withBudget.map((cat, i) => {
          const b = budgetFor(cat.id)!;
          const spent = d.spentBy.get(cat.id) ?? 0;
          const r = spent / b.amount;
          return (
            <Pressable key={cat.id} onPress={() => edit(cat.id)}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <IconTile emoji={cat.emoji} color={cat.color ?? PALETTE[i % PALETTE.length]} size={42} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{cat.name}</T>
                    <T variant="caption">
                      {formatMoney(spent, currency)} of {formatMoney(b.amount, currency)}
                    </T>
                  </View>
                  <T variant="bodyStrong" color={r >= 1 ? c.danger : r >= 0.8 ? c.warning : c.success}>
                    {r >= 1 ? `${formatMoney(spent - b.amount, currency)} over` : `${formatMoney(b.amount - spent, currency)} left`}
                  </T>
                </View>
                <View style={{ marginTop: 12 }}>
                  <ProgressBar ratio={r} />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {without.length > 0 && <SectionHeader title="No budget yet" />}
      <Card style={{ paddingVertical: 4 }}>
        {without.map((cat, i) => (
          <Pressable
            key={cat.id}
            onPress={() => edit(cat.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
          >
            <IconTile emoji={cat.emoji} color={cat.color ?? PALETTE[i % PALETTE.length]} size={38} />
            <T variant="bodyStrong" style={{ flex: 1 }}>{cat.name}</T>
            <T variant="caption">{formatMoney(d.spentBy.get(cat.id) ?? 0, currency)}</T>
            <T variant="caption" color={c.primary}>Set ›</T>
          </Pressable>
        ))}
      </Card>
      <Pressable onPress={() => router.push("/recurring")} style={{ marginTop: 16 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconTile icon="repeat" color={c.primary} size={40} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">Recurring bills</T>
            <T variant="caption">Rent, fees and subscriptions added automatically</T>
          </View>
          <T variant="caption" color={c.primary}>Open ›</T>
        </Card>
      </Pressable>
      <T variant="caption" style={{ textAlign: "center", marginTop: 16 }}>
        You&apos;ll get a notification at 80% and 100% of each budget.
      </T>
    </Screen>
  );
}
