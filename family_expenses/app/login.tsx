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
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Validation", "Please enter your email and password.");
      return;
    }
    if (mode === "register") {
      if (!name.trim()) {
        Alert.alert("Validation", "Please enter your name.");
        return;
      }
      if (password.length < 8) {
        Alert.alert("Validation", "Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Validation", "Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    const result =
      mode === "login"
        ? await login(email.trim(), password)
        : await register(name.trim(), email.trim(), password);
    setLoading(false);

    if (result.error) {
      Alert.alert("Error", result.error);
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appIcon}>👨‍👩‍👧‍👦</Text>
          <Text style={styles.appName}>Family Expenses</Text>
          <Text style={styles.appTagline}>Track and split expenses together</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === "login" && styles.toggleBtnActive]}
            onPress={() => setMode("login")}
          >
            <Text
              style={[
                styles.toggleBtnText,
                mode === "login" && styles.toggleBtnTextActive,
              ]}
            >
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === "register" && styles.toggleBtnActive]}
            onPress={() => setMode("register")}
          >
            <Text
              style={[
                styles.toggleBtnText,
                mode === "register" && styles.toggleBtnTextActive,
              ]}
            >
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          {mode === "register" && (
            <>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType={mode === "register" ? "next" : "done"}
            onSubmitEditing={mode === "login" ? handleSubmit : undefined}
          />

          {mode === "register" && (
            <>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Repeat password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitBtnText}>
              {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.syncNote}>
          💡 Data is stored on this device. To sync across multiple devices, connect a cloud backend.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 24, paddingBottom: 48, flexGrow: 1, justifyContent: "center" },

  header: { alignItems: "center", marginBottom: 32 },
  appIcon: { fontSize: 72, marginBottom: 12 },
  appName: { fontSize: 28, fontWeight: "800", color: "#1C1C1E", marginBottom: 6 },
  appTagline: { fontSize: 15, color: "#6C6C70", textAlign: "center" },

  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#E5E5EA",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  toggleBtnActive: { backgroundColor: "#fff" },
  toggleBtnText: { fontSize: 15, color: "#6C6C70", fontWeight: "500" },
  toggleBtnTextActive: { color: "#1C1C1E", fontWeight: "700" },

  formCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6C6C70",
    marginBottom: 6,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },

  submitBtn: {
    backgroundColor: "#4A90D9",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  syncNote: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});
