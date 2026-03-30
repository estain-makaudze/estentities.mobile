import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate } from "../services/odooApi";
import { useAuth } from "../store/authStore";
import { useSettings } from "../store/settingsStore";

export default function LoginScreen() {
  const { login, isAuthenticated } = useAuth();
  const { settings, saveSettings } = useSettings();

  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || "");
  const [db, setDb] = useState(settings.db || "");
  const [username, setUsername] = useState(settings.username || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/(tabs)/dashboard");
  }, [isAuthenticated]);

  useEffect(() => {
    setBaseUrl(settings.baseUrl || "");
    setDb(settings.db || "");
    setUsername(settings.username || "");
  }, [settings]);

  const handleLogin = async () => {
    if (!baseUrl.trim() || !db.trim() || !username.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError(null);
    const newSettings = {
      baseUrl: baseUrl.trim().replace(/\/$/, ""),
      db: db.trim(),
      username: username.trim(),
      password: password.trim(),
      defaultCurrency: settings.defaultCurrency || "USD",
    };
    try {
      const uid = await authenticate(newSettings);
      await saveSettings(newSettings);
      await login({
        uid,
        username: username.trim(),
        displayName: username.trim().split("@")[0],
      });
      router.replace("/(tabs)/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F1F5F9" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Ionicons name="wallet" size={40} color="#2563EB" />
          </View>
          <Text style={styles.appName}>Daily Accounting</Text>
          <Text style={styles.subtitle}>Sign in to sync your expenses</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://your-odoo.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>Database</Text>
          <TextInput
            style={styles.input}
            value={db}
            onChangeText={setDb}
            placeholder="your_database"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Email / Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.signInButton,
              pressed && styles.signInPressed,
              loading && styles.signInDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                <Text style={styles.signInText}>Sign In</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>New user? </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Create Account",
                "New accounts are set up by your Odoo administrator. Contact your system admin to get credentials.",
                [{ text: "OK" }]
              )
            }
          >
            <Text style={styles.registerLink}>Contact Admin</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center", backgroundColor: "#F1F5F9" },
  header: { alignItems: "center", marginBottom: 32 },
  logoBox: {
    width: 80, height: 80, borderRadius: 20, backgroundColor: "#EFF6FF",
    justifyContent: "center", alignItems: "center", marginBottom: 16,
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
  },
  appName: { fontSize: 28, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: "#6B7280", marginTop: 4 },
  form: {
    backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  label: {
    fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase",
    letterSpacing: 0.5, marginBottom: 6, marginTop: 16,
  },
  input: {
    backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827",
  },
  passwordRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB",
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10,
  },
  passwordInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827",
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  errorBanner: {
    marginTop: 12, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 8, padding: 10, flexDirection: "row", alignItems: "center", gap: 6,
  },
  errorText: { color: "#DC2626", fontSize: 13, flex: 1 },
  signInButton: {
    marginTop: 24, backgroundColor: "#2563EB", borderRadius: 12,
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 8, paddingVertical: 15,
  },
  signInPressed: { backgroundColor: "#1D4ED8" },
  signInDisabled: { backgroundColor: "#93C5FD" },
  signInText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  registerText: { color: "#6B7280", fontSize: 14 },
  registerLink: { color: "#2563EB", fontWeight: "600", fontSize: 14 },
});
