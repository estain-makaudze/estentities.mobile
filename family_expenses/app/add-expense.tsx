import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { DateField } from "../components/DateField";
import { SplitEditor } from "../components/SplitEditor";
import { Avatar, Button, Chip, Field, FieldLabel, Header, IconTile, Screen, Segmented, T } from "../components/ui";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import { PALETTE, fonts, radius, useTheme } from "../theme";
import type { Frequency } from "../types";
import { today } from "../utils/dates";
import { buildSplits, determineSplitMode, extractCustomPercentages, type SplitMode } from "../utils/splits";

/** Add or edit an expense (?id= to edit). Saved to the phone instantly; syncs later. */
export default function ExpenseFormScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { userId } = useAuth();
  const { members, currency } = useHousehold();
  const { categories, categoryById, addExpense, updateExpense, deleteExpense, getExpense, saveRecurring } = useApp();
  const existing = id ? getExpense(id) : null;

  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? categories[0]?.id ?? null);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? userId ?? members[0]?.id ?? "");
  const [date, setDate] = useState(existing?.date ?? today());
  const [note, setNote] = useState(existing?.note ?? "");
  const [mode, setMode] = useState<SplitMode>(() =>
    existing ? determineSplitMode(existing.splits, members) : members.length > 1 ? "equal" : "none"
  );
  const [pcts, setPcts] = useState<Record<string, string>>(() => extractCustomPercentages(existing?.splits, members));
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("month");
  const [touchedSplit, setTouchedSplit] = useState(!!existing);

  // Apply the category's default split (new expenses only, until the user edits the split).
  useEffect(() => {
    if (touchedSplit) return;
    const def = categoryById(categoryId)?.defaultSplits;
    if (def && def.length) {
      setMode(determineSplitMode(def, members));
      setPcts(extractCustomPercentages(def, members));
    } else {
      setMode(members.length > 1 ? "equal" : "none");
    }
  }, [categoryId, categoryById, members, touchedSplit]);

  if (id && !existing) {
    return (
      <Screen>
        <Header title="Expense" />
        <T muted>This expense was deleted.</T>
      </Screen>
    );
  }

  const submit = () => {
    const value = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(value) || value <= 0) return Alert.alert("Amount", "Enter an amount greater than 0.");
    if (!description.trim()) return Alert.alert("Description", "What was this for?");
    const splits = buildSplits(mode, members, pcts);
    if (typeof splits === "string") return Alert.alert("Split", splits);

    const fields = {
      description: description.trim(),
      amount: Math.round(value * 100) / 100,
      date,
      paidBy,
      categoryId,
      splits,
      note: note.trim() || null,
    };
    if (existing) {
      updateExpense({ ...existing, ...fields });
    } else if (recurring) {
      // The template creates this and every future occurrence (starting on `date`).
      saveRecurring({
        ...fields, frequency, intervalN: 1, startDate: date, nextDue: date, active: true,
      });
    } else {
      addExpense(fields);
    }
    router.back();
  };

  const remove = () =>
    Alert.alert("Delete expense?", "It will be removed for the whole family.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteExpense(existing!.id); router.back(); } },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Header title={existing ? "Edit expense" : "New expense"} />

        {/* Amount */}
        <View style={{ alignItems: "center", paddingVertical: 12 }}>
          <T variant="caption">Amount ({currency})</T>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            autoFocus={!existing}
            style={{ fontFamily: fonts.extrabold, fontSize: 44, color: c.ink, textAlign: "center", minWidth: 160, paddingVertical: 4 }}
          />
        </View>

        <Field label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Groceries at OK Mart" />

        <FieldLabel>Category</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {categories.map((cat, i) => {
            const on = cat.id === categoryId;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategoryId(cat.id)}
                style={{
                  alignItems: "center", gap: 6, padding: 8, borderRadius: radius.md, width: 78,
                  backgroundColor: on ? c.card : "transparent", borderWidth: 1.5, borderColor: on ? c.primary : "transparent",
                }}
              >
                <IconTile emoji={cat.emoji} color={cat.color ?? PALETTE[i % PALETTE.length]} size={42} />
                <Text numberOfLines={1} style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 12, color: on ? c.ink : c.sub }}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FieldLabel>Paid by</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setPaidBy(m.id)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 14, padding: 4, borderRadius: 999,
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

        <FieldLabel>Date</FieldLabel>
        <DateField value={date} onChange={setDate} />

        {members.length > 1 && (
          <>
            <FieldLabel>Split</FieldLabel>
            <SplitEditor
              users={members}
              mode={mode}
              onModeChange={(m) => { setTouchedSplit(true); setMode(m); }}
              percentages={pcts}
              onPercentagesChange={(p) => { setTouchedSplit(true); setPcts(p); }}
            />
          </>
        )}

        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything to remember" multiline />

        {!existing && (
          <View style={{ backgroundColor: c.card, borderRadius: radius.md, padding: 16, marginTop: 18, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">Repeat this expense</T>
                <T variant="caption">Rent, school fees, subscriptions…</T>
              </View>
              <Switch value={recurring} onValueChange={setRecurring} trackColor={{ true: c.primary }} />
            </View>
            {recurring && (
              <Segmented
                value={frequency}
                onChange={setFrequency}
                options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]}
              />
            )}
          </View>
        )}

        <View style={{ marginTop: 28, gap: 10 }}>
          <Button title={existing ? "Save changes" : "Save expense"} onPress={submit} />
          {existing && <Button title="Delete expense" variant="danger" onPress={remove} />}
          {existing?.recurringId && (
            <Chip label="Part of a recurring bill — manage in Bills" onPress={() => router.push("/recurring")} />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
