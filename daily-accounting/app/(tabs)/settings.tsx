// Settings screen – configure Odoo connection and app defaults
import { Ionicons } from "@expo/vector-icons";
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
  View,
} from "react-native";
import { authenticate } from "../../services/odooApi";
import { useSettings } from "../../store/settingsStore";
import { OdooSettings } from "../../types/odoo";

export default function SettingsScreen() {
  const { settings, saveSettings } = useSettings();

  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [db, setDb] = useState(settings.db);
  const [username, setUsername] = useState(settings.username);
  const [password, setPassword] = useState(settings.password);
  const [defaultCurrency, setDefaultCurrency] = useState(
    settings.defaultCurrency || "USD"
  );

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Keep local state in sync when context loads async
  useEffect(() => {
    setBaseUrl(settings.baseUrl);
    setDb(settings.db);
    setUsername(settings.username);
    setPassword(settings.password);
    setDefaultCurrency(settings.defaultCurrency || "USD");
  }, [settings]);

  const currentDraft: OdooSettings = {
    baseUrl: baseUrl.trim(),
    db: db.trim(),
    username: username.trim(),
    password,
    defaultCurrency: defaultCurrency.trim().toUpperCase() || "USD",
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const uid = await authenticate(currentDraft);
      setTestResult({ ok: true, msg: `Connected! User ID: ${uid}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, msg });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings(currentDraft);
      Alert.alert("Saved", "Settings have been saved successfully.");
    } catch {
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Odoo Connection</Text>

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
          placeholder="your_database_name"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Username / Email</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="admin@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password / API Key</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          App Defaults
        </Text>

        <Text style={styles.label}>Default Currency (ISO code)</Text>
        <TextInput
          style={styles.input}
          value={defaultCurrency}
          onChangeText={(t) => setDefaultCurrency(t.toUpperCase())}
          placeholder="USD"
          autoCapitalize="characters"
          maxLength={3}
        />

        {/* Test Connection */}
        <Pressable
          style={({ pressed }) => [
            styles.testButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleTest}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator color="#2563EB" />
          ) : (
            <>
              <Ionicons name="wifi-outline" size={18} color="#2563EB" />
              <Text style={styles.testButtonText}>Test Connection</Text>
            </>
          )}
        </Pressable>

        {testResult && (
          <View
            style={[
              styles.resultBanner,
              testResult.ok ? styles.successBanner : styles.errorBanner,
            ]}
          >
            <Ionicons
              name={testResult.ok ? "checkmark-circle" : "alert-circle"}
              size={18}
              color={testResult.ok ? "#16A34A" : "#DC2626"}
            />
            <Text
              style={[
                styles.resultText,
                { color: testResult.ok ? "#16A34A" : "#DC2626" },
              ]}
            >
              {testResult.msg}
            </Text>
          </View>
        )}

        {/* Save */}
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
            saving && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: "#F9FAFB",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  testButton: {
    marginTop: 24,
    borderWidth: 2,
    borderColor: "#2563EB",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    backgroundColor: "#EFF6FF",
  },
  testButtonText: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  resultBanner: {
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  successBanner: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  resultText: {
    flex: 1,
    fontSize: 14,
  },
  saveButton: {
    marginTop: 20,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 15,
  },
  saveButtonPressed: {
    backgroundColor: "#1D4ED8",
  },
  saveButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});


