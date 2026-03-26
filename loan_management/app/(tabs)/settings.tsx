import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { authenticate } from "../../services/loanApi";
import { sendSms } from "../../services/twilioSms";
import { useCache } from "../../store/cacheStore";
import { useSettings } from "../../store/settingsStore";
import { OdooSettings } from "../../types/odoo";

export default function SettingsScreen() {
  const { settings, saveSettings } = useSettings();
  const { refreshAll, isOnline } = useCache();

  // ── Odoo fields ──────────────────────────────────────────────────────────
  const [baseUrl, setBaseUrl]                 = useState(settings.baseUrl);
  const [db, setDb]                           = useState(settings.db);
  const [username, setUsername]               = useState(settings.username);
  const [password, setPassword]               = useState(settings.password);
  const [defaultCurrency, setDefaultCurrency] = useState(settings.defaultCurrency || "UGX");

  // ── Twilio fields ─────────────────────────────────────────────────────────
  const [smsEnabled, setSmsEnabled]             = useState(settings.smsEnabled ?? false);
  const [twilioAccountSid, setTwilioAccountSid] = useState(settings.twilioAccountSid || "");
  const [twilioAuthToken, setTwilioAuthToken]   = useState(settings.twilioAuthToken || "");
  const [twilioFromNumber, setTwilioFromNumber] = useState(settings.twilioFromNumber || "");
  const [testPhone, setTestPhone]               = useState("");

  // ── UI state ──────────────────────────────────────────────────────────────
  const [testing, setTesting]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; message: string } | null>(null);
  const [smsResult, setSmsResult]   = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setBaseUrl(settings.baseUrl);
    setDb(settings.db);
    setUsername(settings.username);
    setPassword(settings.password);
    setDefaultCurrency(settings.defaultCurrency || "UGX");
    setSmsEnabled(settings.smsEnabled ?? false);
    setTwilioAccountSid(settings.twilioAccountSid || "");
    setTwilioAuthToken(settings.twilioAuthToken || "");
    setTwilioFromNumber(settings.twilioFromNumber || "");
  }, [settings]);

  const draft = useMemo<OdooSettings>(
    () => ({
      baseUrl: baseUrl.trim(),
      db: db.trim(),
      username: username.trim(),
      password,
      defaultCurrency: defaultCurrency.trim().toUpperCase() || "UGX",
      smsEnabled,
      twilioAccountSid: twilioAccountSid.trim(),
      twilioAuthToken: twilioAuthToken.trim(),
      twilioFromNumber: twilioFromNumber.trim(),
    }),
    [baseUrl, db, defaultCurrency, password, username,
      smsEnabled, twilioAccountSid, twilioAuthToken, twilioFromNumber]
  );

  const testConnection = async () => {
    setTesting(true);
    setResult(null);
    try {
      const uid = await authenticate(draft);
      setResult({ ok: true, message: `Connected successfully. User ID: ${uid}` });
    } catch (error: unknown) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await saveSettings(draft);
      if (isOnline) await refreshAll();
      Alert.alert(
        "Saved",
        isOnline
          ? "Settings saved and data sync started."
          : "Settings saved. Connect to the internet to sync invoices and schedules."
      );
    } catch (error: unknown) {
      Alert.alert("Save failed", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    if (!testPhone.trim()) {
      Alert.alert("Missing number", "Enter a phone number in the 'Test SMS To' field first.");
      return;
    }
    if (!twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioFromNumber.trim()) {
      Alert.alert("Missing credentials", "Fill in Account SID, Auth Token and From Number first.");
      return;
    }
    setTestingSms(true);
    setSmsResult(null);
    try {
      await sendSms(
        twilioAccountSid.trim(),
        twilioAuthToken.trim(),
        twilioFromNumber.trim(),
        testPhone.trim(),
        "Test from Loan Management App — Twilio is configured correctly! ✓"
      );
      setSmsResult({ ok: true, message: "Test SMS sent successfully!" });
    } catch (err: unknown) {
      setSmsResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingSms(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* ── Odoo Connection ──────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Odoo Connection</Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl}
          placeholder="https://your-odoo-server.com"
          autoCapitalize="none" autoCorrect={false} keyboardType="url" />

        <Text style={styles.label}>Database</Text>
        <TextInput style={styles.input} value={db} onChangeText={setDb}
          placeholder="odoo_database" autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.label}>Username / Email</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername}
          placeholder="user@example.com"
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />

        <Text style={styles.label}>Password / API Key</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          placeholder="••••••••" secureTextEntry autoCapitalize="none" autoCorrect={false} />

        {/* ── Display Defaults ─────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Display Defaults</Text>

        <Text style={styles.label}>Currency Code</Text>
        <TextInput style={styles.input} value={defaultCurrency}
          onChangeText={(v) => setDefaultCurrency(v.toUpperCase())}
          placeholder="UGX" autoCapitalize="characters" maxLength={3} />

        <View style={styles.infoCard}>
          <Ionicons
            name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
            size={18} color={isOnline ? "#166534" : "#92400E"} />
          <Text style={styles.infoText}>
            {isOnline
              ? "The app is online and can refresh invoices and schedules after save."
              : "The app is offline. Existing cached lists stay available on the device."}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={testConnection} disabled={testing}>
          {testing ? <ActivityIndicator color="#2563EB" /> : (
            <>
              <Ionicons name="wifi-outline" size={18} color="#2563EB" />
              <Text style={styles.secondaryButtonText}>Test Connection</Text>
            </>
          )}
        </Pressable>

        {result ? (
          <View style={[styles.resultBanner, result.ok ? styles.resultSuccess : styles.resultError]}>
            <Ionicons name={result.ok ? "checkmark-circle" : "alert-circle"} size={18}
              color={result.ok ? "#166534" : "#B91C1C"} />
            <Text style={[styles.resultText, { color: result.ok ? "#166534" : "#B91C1C" }]}>
              {result.message}
            </Text>
          </View>
        ) : null}

        {/* ── SMS Notifications (Twilio) ───────────────────────────── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>SMS Notifications (Twilio)</Text>

        {/* Enable toggle */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Enable Payment SMS</Text>
            <Text style={styles.switchSub}>
              Automatically send a confirmation SMS to customers after a payment is recorded
            </Text>
          </View>
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
            thumbColor={smsEnabled ? "#2563EB" : "#9CA3AF"}
          />
        </View>

        {smsEnabled ? (
          <>
            {/* Setup info */}
            <View style={styles.twilioInfoCard}>
              <Ionicons name="information-circle-outline" size={16} color="#0369A1" />
              <Text style={styles.twilioInfoText}>
                Sign up at{" "}
                <Text style={{ fontWeight: "700" }}>twilio.com</Text>
                {" "}to get your Account SID, Auth Token and a sender number.{"\n"}
                The customer's mobile/phone from their Odoo contact record is used automatically.
              </Text>
            </View>

            <Text style={styles.label}>Account SID</Text>
            <TextInput style={styles.input} value={twilioAccountSid}
              onChangeText={setTwilioAccountSid}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.label}>Auth Token</Text>
            <TextInput style={styles.input} value={twilioAuthToken}
              onChangeText={setTwilioAuthToken}
              placeholder="your_auth_token"
              secureTextEntry autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.label}>From Number (Twilio phone number)</Text>
            <TextInput style={styles.input} value={twilioFromNumber}
              onChangeText={setTwilioFromNumber}
              placeholder="+1234567890" keyboardType="phone-pad" />

            {/* ── Test SMS ─────────────────────────────────────────── */}
            <View style={styles.testSmsCard}>
              <Text style={styles.testSmsTitle}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#374151" />
                {"  "}Send a Test SMS
              </Text>
              <Text style={styles.testSmsSub}>
                Enter any phone number to verify your Twilio credentials are working before going live.
              </Text>
              <Text style={[styles.label, { marginTop: 10 }]}>Test Phone Number</Text>
              <TextInput style={styles.input} value={testPhone} onChangeText={setTestPhone}
                placeholder="+256700000000" keyboardType="phone-pad" />

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton, { marginTop: 12 }, pressed && styles.buttonPressed,
                ]}
                onPress={handleTestSms} disabled={testingSms}>
                {testingSms ? <ActivityIndicator color="#2563EB" /> : (
                  <>
                    <Ionicons name="send-outline" size={17} color="#2563EB" />
                    <Text style={styles.secondaryButtonText}>Send Test SMS</Text>
                  </>
                )}
              </Pressable>

              {smsResult ? (
                <View style={[styles.resultBanner,
                  { marginTop: 10 },
                  smsResult.ok ? styles.resultSuccess : styles.resultError]}>
                  <Ionicons name={smsResult.ok ? "checkmark-circle" : "alert-circle"} size={18}
                    color={smsResult.ok ? "#166534" : "#B91C1C"} />
                  <Text style={[styles.resultText, { color: smsResult.ok ? "#166534" : "#B91C1C" }]}>
                    {smsResult.message}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Save ─────────────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            saving && styles.primaryButtonDisabled,
          ]}
          onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Ionicons name="save-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Save Settings</Text>
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
    paddingBottom: 60,
    backgroundColor: "#F9FAFB",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 6,
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
  infoCard: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
  },
  // ── Switch ───────────────────────────────────────────────────────────────
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginTop: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  switchSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
  // ── Twilio info ──────────────────────────────────────────────────────────
  twilioInfoCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
    marginTop: 14,
  },
  twilioInfoText: {
    flex: 1,
    color: "#0369A1",
    fontSize: 13,
    lineHeight: 19,
  },
  // ── Test SMS card ─────────────────────────────────────────────────────────
  testSmsCard: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
  },
  testSmsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  testSmsSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 17,
  },
  // ── Buttons ──────────────────────────────────────────────────────────────
  secondaryButton: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#2563EB",
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPressed: { opacity: 0.8 },
  resultBanner: {
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  resultSuccess: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  resultError:   { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  resultText:    { flex: 1, fontSize: 14 },
  primaryButton: {
    marginTop: 28,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 15,
  },
  primaryButtonPressed:  { backgroundColor: "#1D4ED8" },
  primaryButtonDisabled: { backgroundColor: "#93C5FD" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
