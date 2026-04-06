import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { AppProvider } from "../context/AppContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { HouseholdProvider, useHousehold } from "../context/HouseholdContext";
import { useSync } from "../hooks/useSync";
import { checkSchema, supabaseMisconfigured } from "../services/supabase";

function SyncRunner() {
  useSync();
  return null;
}

function SchemaCheck() {
  useEffect(() => {
    checkSchema().then((msg) => {
      if (msg) Alert.alert("Database Setup Required", msg, [{ text: "OK" }]);
    });
  }, []);
  return null;
}

function AuthGuard() {
  const { session, loading: authLoading } = useAuth();
  const { household, loading: householdLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || householdLoading) return;
    const inLogin = segments[0] === "login";
    const inSetup = segments[0] === "household-setup";
    if (!session) {
      if (!inLogin) router.replace("/login");
    } else if (!household) {
      if (!inSetup) router.replace("/household-setup");
    } else {
      if (inLogin || inSetup) router.replace("/(tabs)");
    }
  }, [session, authLoading, household, householdLoading, segments]);

  if (authLoading || householdLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F2F2F7" }}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }
  return null;
}

export default function RootLayout() {
  // If the build is missing Supabase credentials, show a clear error
  // instead of crashing immediately on startup.
  if (supabaseMisconfigured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
                     padding: 32, backgroundColor: "#F2F2F7" }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⚙️</Text>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#1C1C1E",
                       textAlign: "center", marginBottom: 12 }}>
          Configuration Error
        </Text>
        <Text style={{ fontSize: 15, color: "#6C6C70", textAlign: "center", lineHeight: 22 }}>
          Supabase credentials are missing from this build.{"\n\n"}
          Make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
          are set in eas.json under the correct build profile, then rebuild.
        </Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <HouseholdProvider>
        <AppProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="household-setup" options={{ headerShown: false }} />
            <Stack.Screen
              name="add-expense"
              options={{
                title: "Add Expense",
                headerStyle: { backgroundColor: "#4A90D9" },
                headerTintColor: "#fff",
                headerTitleStyle: { fontWeight: "bold" },
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="edit-expense"
              options={{
                title: "Edit Expense",
                headerStyle: { backgroundColor: "#4A90D9" },
                headerTintColor: "#fff",
                headerTitleStyle: { fontWeight: "bold" },
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="add-settlement"
              options={{
                title: "Record Payment",
                headerStyle: { backgroundColor: "#2ECC71" },
                headerTintColor: "#fff",
                headerTitleStyle: { fontWeight: "bold" },
                presentation: "modal",
              }}
            />
          </Stack>
          <SchemaCheck />
          <AuthGuard />
          <SyncRunner />
        </AppProvider>
      </HouseholdProvider>
    </AuthProvider>
  );
}
