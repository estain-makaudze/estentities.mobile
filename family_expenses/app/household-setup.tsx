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
import { useHousehold } from "../context/HouseholdContext";
import { useAuth } from "../context/AuthContext";

type Mode = "choice" | "create" | "join";

export default function HouseholdSetupScreen() {
  const { createHousehold, joinHousehold } = useHousehold();
  const { profile, logout } = useAuth();

  const [mode, setMode] = useState<Mode>("choice");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const name = householdName.trim();
    if (!name) {
      Alert.alert("Validation", "Please enter a household name.");
      return;
    }
    setLoading(true);
    const result = await createHousehold(name);
    setLoading(false);
    if (result.error) Alert.alert("Error", result.error);
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert("Validation", "Please enter a valid invite code.");
      return;
    }
    setLoading(true);
    const result = await joinHousehold(code);
    setLoading(false);
    if (result.error) Alert.alert("Error", result.error);
  };

  const handleSignOut = async () => {
    await logout();
  };

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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>🏠</Text>
          <Text style={styles.title}>Set Up Your Household</Text>
          <Text style={styles.subtitle}>
            Create a new shared household or join an existing one with an invite code.
          </Text>
          {profile && (
            <Text style={styles.welcomeText}>Signed in as {profile.email}</Text>
          )}
        </View>

        {mode === "choice" && (
          <View style={styles.choiceContainer}>
            <TouchableOpacity
              style={[styles.choiceCard, { borderColor: "#4A90D9" }]}
              onPress={() => setMode("create")}
            >
              <Text style={styles.choiceIcon}>✨</Text>
              <Text style={styles.choiceTitle}>Create Household</Text>
              <Text style={styles.choiceDesc}>
                Start a new household and invite your family members.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceCard, { borderColor: "#2ECC71" }]}
              onPress={() => setMode("join")}
            >
              <Text style={styles.choiceIcon}>🔗</Text>
              <Text style={styles.choiceTitle}>Join Household</Text>
              <Text style={styles.choiceDesc}>
                Enter an invite code to join an existing household.
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === "create" && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create Household</Text>
            <Text style={styles.label}>Household Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. The Smiths, Our Home…"
              value={householdName}
              onChangeText={setHouseholdName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              <Text style={styles.submitBtnText}>
                {loading ? "Creating…" : "Create Household"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={() => setMode("choice")}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === "join" && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Join Household</Text>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="e.g. ABCD1234"
              value={inviteCode}
              onChangeText={(v) => setInviteCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              maxLength={8}
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#2ECC71" }, loading && styles.submitBtnDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              <Text style={styles.submitBtnText}>
                {loading ? "Joining…" : "Join Household"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={() => setMode("choice")}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 24, paddingBottom: 48, flexGrow: 1, justifyContent: "center" },

  header: { alignItems: "center", marginBottom: 32 },
  icon: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#1C1C1E", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#6C6C70", textAlign: "center", lineHeight: 22, marginBottom: 8 },
  welcomeText: { fontSize: 13, color: "#8E8E93", marginTop: 4 },

  choiceContainer: { gap: 16 },
  choiceCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  choiceIcon: { fontSize: 32, marginBottom: 8 },
  choiceTitle: { fontSize: 18, fontWeight: "700", color: "#1C1C1E", marginBottom: 4 },
  choiceDesc: { fontSize: 14, color: "#6C6C70", lineHeight: 20 },

  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  formTitle: { fontSize: 20, fontWeight: "700", color: "#1C1C1E", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#6C6C70", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    marginBottom: 16,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center",
  },

  submitBtn: {
    backgroundColor: "#4A90D9",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  backBtn: { padding: 12, alignItems: "center" },
  backBtnText: { color: "#4A90D9", fontSize: 15, fontWeight: "600" },

  signOutBtn: { marginTop: 32, alignItems: "center" },
  signOutBtnText: { color: "#8E8E93", fontSize: 14 },
});
