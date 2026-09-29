import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Chip, Field, FieldLabel, Screen, Segmented, T } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import { CURRENCIES } from "../utils/format";

/** No family yet: create one (and share its code) or join with a code. */
export default function HouseholdSetupScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { createHousehold, joinHousehold } = useHousehold();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(user ? `${user.name.split(" ")[0]}'s family` : "");
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "create") {
        if (!name.trim()) throw new Error("Give your family a name.");
        await createHousehold(name.trim(), currency);
      } else {
        if (code.trim().length < 4) throw new Error("Enter the invite code you were sent.");
        await joinHousehold(code.trim());
      }
    } catch (e) {
      Alert.alert(mode === "create" ? "Couldn't create family" : "Couldn't join", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ paddingTop: insets.top + 32, gap: 8 }}>
          <T variant="caption">Hello {user?.name ?? ""} 👋</T>
          <T variant="h1">Set up your family</T>
          <T muted>Create a family and send the code to your members, or join the family someone invited you to.</T>
        </View>

        <View style={{ marginTop: 24 }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ value: "create", label: "Create a family" }, { value: "join", label: "Join with code" }]}
          />
        </View>

        <Card style={{ marginTop: 16 }}>
          {mode === "create" ? (
            <>
              <Field label="Family name" value={name} onChangeText={setName} placeholder="e.g. The Makaudzes" />
              <FieldLabel>Currency</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CURRENCIES.map((cur) => (
                  <Chip key={cur} label={cur} active={cur === currency} onPress={() => setCurrency(cur)} />
                ))}
              </ScrollView>
              <T variant="caption" style={{ marginTop: 10 }}>
                Everyone in the family uses this currency. The owner can change it later.
              </T>
            </>
          ) : (
            <Field
              label="Invite code"
              value={code}
              onChangeText={setCode}
              placeholder="ABCD2345"
              autoCapitalize="characters"
              autoCorrect={false}
              style={{ letterSpacing: 4, fontSize: 20, textAlign: "center" }}
            />
          )}
          <Button
            title={mode === "create" ? "Create family" : "Join family"}
            onPress={submit}
            loading={busy}
            style={{ marginTop: 24 }}
          />
          <T variant="caption" style={{ textAlign: "center", marginTop: 12 }}>
            This step needs an internet connection. After that the app works offline.
          </T>
        </Card>

        <Button title="Use a different number" variant="ghost" onPress={logout} style={{ marginTop: 12 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
