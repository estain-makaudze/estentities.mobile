import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "../context/AppContext";
import { useHousehold } from "../context/HouseholdContext";

export default function AddSettlementScreen() {
  const { addSettlement } = useApp();
  const { members: users } = useHousehold();
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromUserId?: string;
    toUserId?: string;
    suggestedAmount?: string;
  }>();

  const [fromUserId, setFromUserId] = useState(
    params.fromUserId ?? users[0]?.id ?? ""
  );
  const [toUserId, setToUserId] = useState(
    params.toUserId ??
      (users.length > 1 ? users[1].id : users[0]?.id ?? "")
  );
  const [amount, setAmount] = useState(params.suggestedAmount ?? "");
  const [note, setNote] = useState("");

  const getUserColor = (id: string) =>
    users.find((u) => u.id === id)?.color ?? "#888";

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (!fromUserId || !toUserId) {
      Alert.alert("Validation", "Please select both users.");
      return;
    }
    if (fromUserId === toUserId) {
      Alert.alert("Validation", "The payer and receiver must be different people.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Validation", "Please enter a valid amount greater than 0.");
      return;
    }

    addSettlement({
      fromUserId,
      toUserId,
      amount: parsedAmount,
      date: new Date().toISOString(),
      note: note.trim() || undefined,
    });

    router.back();
  };

  if (users.length < 2) {
    return (
      <View style={styles.center}>
        <Text style={styles.noUsersText}>
          You need at least two household members to record a settlement.
        </Text>
        <TouchableOpacity
          style={styles.goUsersBtn}
          onPress={() => router.push("/(tabs)/household")}
        >
          <Text style={styles.goUsersBtnText}>View Household</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>
          Record a partial or full payment from one household member to another.
          This will reduce the outstanding balance between them.
        </Text>

        <Text style={styles.sectionTitle}>Who Paid</Text>
        <View style={styles.pillRow}>
          {users.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[
                styles.pill,
                fromUserId === u.id && { backgroundColor: u.color },
              ]}
              onPress={() => setFromUserId(u.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  fromUserId === u.id && styles.pillTextActive,
                ]}
              >
                {u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Who Received</Text>
        <View style={styles.pillRow}>
          {users.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[
                styles.pill,
                toUserId === u.id && { backgroundColor: u.color },
              ]}
              onPress={() => setToUserId(u.id)}
            >
              <Text
                style={[
                  styles.pillText,
                  toUserId === u.id && styles.pillTextActive,
                ]}
              >
                {u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {fromUserId && toUserId && fromUserId !== toUserId && (
          <View style={styles.previewRow}>
            <View style={[styles.previewAvatar, { backgroundColor: getUserColor(fromUserId) }]}>
              <Text style={styles.avatarText}>
                {users.find((u) => u.id === fromUserId)?.name[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.previewArrow}>→</Text>
            <View style={[styles.previewAvatar, { backgroundColor: getUserColor(toUserId) }]}>
              <Text style={styles.avatarText}>
                {users.find((u) => u.id === toUserId)?.name[0].toUpperCase()}
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Amount ($)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <Text style={styles.sectionTitle}>Note (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="e.g. Venmo transfer, cash…"
          value={note}
          onChangeText={setNote}
          multiline
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Record Payment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  noUsersText: { fontSize: 16, color: "#6C6C70", textAlign: "center", marginBottom: 16 },
  goUsersBtn: { backgroundColor: "#4A90D9", borderRadius: 12, padding: 14, paddingHorizontal: 28 },
  goUsersBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  description: {
    fontSize: 14,
    color: "#6C6C70",
    lineHeight: 20,
    backgroundColor: "#EAF4FF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6C6C70",
    marginTop: 16,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#E5E5EA",
  },
  pillText: { fontSize: 14, color: "#3A3A3C" },
  pillTextActive: { color: "#fff", fontWeight: "600" },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 12,
  },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  previewArrow: { fontSize: 28, color: "#2ECC71" },

  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  noteInput: { minHeight: 64, textAlignVertical: "top" },

  submitBtn: {
    backgroundColor: "#2ECC71",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { borderRadius: 14, padding: 14, alignItems: "center", marginTop: 10 },
  cancelBtnText: { color: "#8E8E93", fontSize: 15 },
});
