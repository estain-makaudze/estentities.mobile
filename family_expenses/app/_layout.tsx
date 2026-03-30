import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppProvider } from "../context/AppContext";
import { AuthProvider, useAuth } from "../context/AuthContext";

function AuthGuard() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inTabs = segments[0] === "(tabs)";
    const inLogin = segments[0] === "login";
    if (!session && inTabs) {
      router.replace("/login");
    } else if (session && inLogin) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments]);

  if (loading) {
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
      <AppProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
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
        <AuthGuard />
      </AppProvider>
    </AuthProvider>
  );
}
