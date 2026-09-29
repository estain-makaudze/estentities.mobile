import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { DateField } from "../components/DateField";
import { SplitEditor } from "../components/SplitEditor";
import { Avatar, Button, Chip, Field, FieldLabel, Header, Screen, Segmented, T } from "../components/ui";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import { fonts, radius, useTheme } from "../theme";
import type { Frequency } from "../types";
import { today } from "../utils/dates";
import { ensureNotificationPermission } from "../utils/notify";
import { buildSplits, determineSplitMode, extractCustomPercentages, type SplitMode } from "../utils/splits";

export default function RecurringFormScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { userId } = useAuth();
  const { members, currency } = useHousehold();
  const { recurring, categories, saveRecurring, deleteRecurring } = useApp();
  const existing = recurring.find((r) => r.id === id) ?? null;

  const [description, setDescription] = useState(existing?.description ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? categories[0]?.id ?? null);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? userId ?? "");
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "month");
  const [intervalN, setIntervalN] = useState(String(existing?.intervalN ?? 1));
  const [nextDue, setNextDue] = useState(existing?.nextDue ?? today());
  const [active, setActive] = useState(existing?.active ?? true);
  const [mode, setMode] = useState<SplitMode>(() =>
    existing ? determineSplitMode(existing.splits, members) : members.length > 1 ? "equal" : "none"
  );
  const [pcts, setPcts] = useState(() => extractCustomPercentages(existing?.splits, members));

  const submit = () => {
    const value = parseFloat(amount.replace(/,/g, ""));
    const n = parseInt(intervalN, 10);
    if (!description.trim()) return Alert.alert("Bill", "Give it a name, e.g. Rent.");
    if (isNaN(value) || value <= 0) return Alert.alert("Amount", "Enter an amount greater than 0.");
    if (isNaN(n) || n < 1) return Alert.alert("Repeat", "Repeat interval must be at least 1.");
    const splits = buildSplits(mode, members, pcts);
    if (typeof splits === "string") return Alert.alert("Split", splits);
    saveRecurring({
      id: existing?.id,
      description: description.trim(),
      amount: Math.round(value * 100) / 100,
      categoryId,
      paidBy,
      splits,
      note: null,
      frequency,
      intervalN: n,
      startDate: existing?.startDate ?? nextDue,
      nextDue,
      active,
    });
    void ensureNotificationPermission();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Header title={existing ? "Edit bill" : "New recurring bill"} />
        <Field label="Name" value={description} onChangeText={setDescription} placeholder="e.g. Rent, School fees, Netflix" />
        <Field label={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />

        <FieldLabel>Repeats</FieldLabel>
        <Segmented
          value={frequency}
          onChange={setFrequency}
          options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
          <T variant="caption">Every</T>
          {["1", "2", "3", "6"].map((n) => (
            <Chip key={n} label={n} active={intervalN === n} onPress={() => setIntervalN(n)} />
          ))}
          <T variant="caption">{frequency}(s)</T>
        </View>

        <FieldLabel>{existing ? "Next due" : "First due"}</FieldLabel>
        <DateField value={nextDue} onChange={setNextDue} />

        <FieldLabel>Category</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {categories.map((cat) => (
            <Chip key={cat.id} label={`${cat.emoji} ${cat.name}`} active={cat.id === categoryId} onPress={() => setCategoryId(cat.id)} />
          ))}
        </ScrollView>

        <FieldLabel>Paid by</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setPaidBy(m.id)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8, padding: 4, paddingRight: 14, borderRadius: 999,
                backgroundColor: paidBy === m.id ? c.dark : c.card, borderWidth: 1, borderColor: paidBy === m.id ? c.dark : c.line,
              }}
            >
              <Avatar name={m.name} color={m.color} size={28} />
              <Text style={{ fontFamily: fonts.semibold, color: paidBy === m.id ? c.onDark : c.ink }}>
                {m.id === userId ? "You" : m.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {members.length > 1 && (
          <>
            <FieldLabel>Split</FieldLabel>
            <SplitEditor users={members} mode={mode} onModeChange={setMode} percentages={pcts} onPercentagesChange={setPcts} />
          </>
        )}

        {existing && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderRadius: radius.md, padding: 16, marginTop: 18 }}>
            <T variant="bodyStrong" style={{ flex: 1 }}>Active</T>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: c.primary }} />
          </View>
        )}

        <View style={{ marginTop: 28, gap: 10 }}>
          <Button title={existing ? "Save changes" : "Add bill"} onPress={submit} />
          {existing && (
            <Button
              title="Delete bill"
              variant="danger"
              onPress={() =>
                Alert.alert("Delete bill?", "Expenses already added stay in your history.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => { deleteRecurring(existing.id); router.back(); } },
                ])
              }
            />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
