import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { AppProvider } from "../context/AppContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { HouseholdProvider, useHousehold } from "../context/HouseholdContext";
import { useSync } from "../hooks/useSync";
import { checkSchema } from "../services/supabase";

function SyncRunner() {
  useSync();
  return null;
}

// Run the schema health-check once when the app starts.
// If the migration hasn't been applied to Supabase yet, show a clear alert
// instead of a cryptic "table not found in schema cache" deep inside a context.
function SchemaCheck() {
  useEffect(() => {
    checkSchema().then((msg) => {
      if (msg) {
        Alert.alert("Database Setup Required", msg, [{ text: "OK" }]);
      }
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

    const inTabs = segments[0] === "(tabs)";
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
