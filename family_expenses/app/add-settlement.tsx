import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { DateField } from "../components/DateField";
import { Avatar, Button, Field, FieldLabel, Header, Screen, T } from "../components/ui";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import { fonts, useTheme } from "../theme";
import type { User } from "../types";
import { today } from "../utils/dates";

function PersonPicker({ users, value, onChange, me }: { users: User[]; value: string; onChange: (id: string) => void; me: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {users.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => onChange(u.id)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, padding: 4, paddingRight: 14, borderRadius: 999,
            backgroundColor: value === u.id ? c.dark : c.card, borderWidth: 1, borderColor: value === u.id ? c.dark : c.line,
          }}
        >
          <Avatar name={u.name} color={u.color} size={28} />
          <Text style={{ fontFamily: fonts.semibold, color: value === u.id ? c.onDark : c.ink }}>{u.id === me ? "You" : u.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Record a payment between two members (settling up). */
export default function AddSettlementScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ fromUserId?: string; toUserId?: string; suggestedAmount?: string }>();
  const { userId } = useAuth();
  const { members, currency } = useHousehold();
  const { addSettlement } = useApp();
  const [from, setFrom] = useState(params.fromUserId ?? userId ?? "");
  const [to, setTo] = useState(params.toUserId ?? members.find((m) => m.id !== (params.fromUserId ?? userId))?.id ?? "");
  const [amount, setAmount] = useState(params.suggestedAmount ?? "");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const submit = () => {
    const value = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(value) || value <= 0) return Alert.alert("Amount", "Enter an amount greater than 0.");
    if (!from || !to || from === to) return Alert.alert("Payment", "Choose two different people.");
    addSettlement({ fromUserId: from, toUserId: to, amount: Math.round(value * 100) / 100, date, note: note.trim() || null });
    router.back();
  };

  if (members.length < 2) {
    return (
      <Screen>
        <Header title="Settle up" />
        <T muted>Invite another family member first — share the code from the Family tab.</T>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Header title="Settle up" />
        <View style={{ alignItems: "center", paddingVertical: 12 }}>
          <T variant="caption">Amount ({currency})</T>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            style={{ fontFamily: fonts.extrabold, fontSize: 44, color: c.ink, textAlign: "center", minWidth: 160 }}
          />
        </View>
        <FieldLabel>Who paid</FieldLabel>
        <PersonPicker users={members} value={from} onChange={setFrom} me={userId} />
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <Ionicons name="arrow-down" size={22} color={c.sub} />
        </View>
        <FieldLabel>Who received</FieldLabel>
        <PersonPicker users={members.filter((m) => m.id !== from)} value={to} onChange={setTo} me={userId} />
        <FieldLabel>Date</FieldLabel>
        <DateField value={date} onChange={setDate} />
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. EcoCash transfer" />
        <Button title="Record payment" onPress={submit} style={{ marginTop: 28 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
