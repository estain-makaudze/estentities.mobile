import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Field, Screen, T } from "../components/ui";
import { ApiError, useAuth } from "../context/AuthContext";
import { getMeta, initDatabase, setMeta } from "../db/database";
import { apiBaseUrl } from "../services/api";
import { radius, useTheme } from "../theme";

/**
 * Welcome: phone number + name. No password.
 * If the number already belongs to a family, the server asks for that
 * family's invite code (so nobody can take over an account by typing a number).
 */
export default function LoginScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(() => {
    initDatabase();
    return getMeta("apiUrl") ?? "";
  });

  const submit = async () => {
    if (phone.replace(/\D/g, "").length < 7) return Alert.alert("Phone number", "Enter your phone number.");
    if (!name.trim()) return Alert.alert("Your name", "Enter the name your family will see.");
    if (needCode && !code.trim()) return Alert.alert("Family code", "Enter your family's invite code.");
    setMeta("apiUrl", server.trim() || null);
    if (!apiBaseUrl()) {
      setShowServer(true);
      return Alert.alert("Server", "Enter the server address first.");
    }
    setBusy(true);
    try {
      await login(phone, name.trim(), needCode ? code.trim() : undefined);
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVITE_REQUIRED") {
        setNeedCode(true);
        Alert.alert("Welcome back", e.message);
      } else {
        Alert.alert("Couldn't sign in", (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ paddingTop: insets.top + 48, gap: 10 }}>
          <Image source={require("../assets/images/icon.png")} style={{ width: 72, height: 72, borderRadius: 20 }} />
          <T variant="display" style={{ marginTop: 20 }}>Family money,{"\n"}together.</T>
          <T muted>Track shared expenses, budgets and bills — works offline and syncs when you&apos;re back online.</T>
        </View>

        <Card style={{ marginTop: 32 }}>
          <Field
            label="Phone number"
            placeholder="077 123 4567"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
            style={{ marginBottom: 0 }}
          />
          <T variant="caption" style={{ marginTop: 6 }}>Local numbers get +263 automatically. Use +country code otherwise.</T>
          <Field label="Your name" placeholder="e.g. Estain" value={name} onChangeText={setName} autoCapitalize="words" />
          {needCode && (
            <Field
              label="Family invite code"
              placeholder="ABCD2345"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
            />
          )}
          <Button title={needCode ? "Sign in" : "Continue"} onPress={submit} loading={busy} style={{ marginTop: 24 }} />
        </Card>

        <Pressable onPress={() => setShowServer((v) => !v)} style={{ alignSelf: "center", marginTop: 20, padding: 8 }}>
          <T variant="caption">Server settings {showServer ? "▲" : "▼"}</T>
        </Pressable>
        {showServer && (
          <View style={{ backgroundColor: c.card, borderRadius: radius.md, padding: 16 }}>
            <Field
              label="Server address"
              placeholder={process.env.EXPO_PUBLIC_API_URL || "https://family.example.org"}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={server}
              onChangeText={setServer}
            />
            <T variant="caption" style={{ marginTop: 6 }}>Leave blank to use the built-in address.</T>
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
