import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, Card, Field, Header, IconTile, Screen, T } from "../components/ui";
import { useApp } from "../context/AppContext";
import { useHousehold } from "../context/HouseholdContext";
import { monthlyTotals } from "../db/queries";
import { PALETTE, useTheme } from "../theme";
import { addMonths, monthKey, monthRange, today } from "../utils/dates";
import { formatMoney } from "../utils/format";
import { ensureNotificationPermission } from "../utils/notify";

/** Set / change / remove a monthly budget. ?category=<id> or "total". */
export default function BudgetFormScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { categories, budgets, setBudget, householdId } = useApp();
  const { currency } = useHousehold();
  const categoryId = category && category !== "total" ? category : null;
  const cat = categories.find((x) => x.id === categoryId) ?? null;
  const existing = budgets.find((b) => b.categoryId === categoryId) ?? null;
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");

  // Suggest the average of the last 3 full months.
  const suggestion = useMemo(() => {
    const cur = monthKey(today());
    const from = monthRange(addMonths(cur, -3)).from;
    const to = monthRange(addMonths(cur, -1)).to;
    if (!categoryId) {
      const rows = monthlyTotals(householdId, from, to);
      return rows.length ? rows.reduce((a, r) => a + r.total, 0) / 3 : 0;
    }
    return 0;
  }, [householdId, categoryId]);

  const save = async () => {
    const n = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(n) || n <= 0) return Alert.alert("Budget", "Enter an amount greater than 0.");
    setBudget(categoryId, n);
    void ensureNotificationPermission();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Header title={existing ? "Edit budget" : "New budget"} />
        <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
          {cat ? (
            <IconTile emoji={cat.emoji} color={cat.color ?? PALETTE[0]} size={56} />
          ) : (
            <IconTile icon="people" color={c.primary} size={56} />
          )}
          <T variant="h2">{cat ? cat.name : "Whole family"}</T>
          <T variant="caption">Monthly budget in {currency}</T>
        </Card>
        <Field
          label="Amount per month"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          autoFocus
          style={{ fontSize: 24, fontWeight: "700" }}
        />
        {suggestion > 0 && !existing && (
          <T variant="caption" style={{ marginTop: 8 }} onPress={() => setAmount(suggestion.toFixed(0))}>
            Your family averaged {formatMoney(suggestion, currency)} over the last 3 months — tap to use.
          </T>
        )}
        <View style={{ marginTop: 28, gap: 10 }}>
          <Button title="Save budget" onPress={save} />
          {existing && (
            <Button
              title="Remove budget"
              variant="danger"
              onPress={() => {
                setBudget(categoryId, null);
                router.back();
              }}
            />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
