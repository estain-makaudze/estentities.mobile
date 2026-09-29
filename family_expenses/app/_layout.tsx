import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts,
} from "@expo-google-fonts/manrope";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
// Defines the background task at module scope (required by expo-task-manager).
import "../tasks/background";
import { AppProvider } from "../context/AppContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { HouseholdProvider, useHousehold } from "../context/HouseholdContext";
import { useTheme } from "../theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Route guard — reads only local state, so it works offline on a cold start. */
function AuthGuard() {
  const { ready, userId } = useAuth();
  const { household } = useHousehold();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    const inLogin = first === "login";
    const inSetup = first === "household-setup";
    if (!userId) {
      if (!inLogin) router.replace("/login");
    } else if (!household) {
      if (!inSetup) router.replace("/household-setup");
    } else if (inLogin || inSetup || !first) {
      router.replace("/(tabs)");
    }
  }, [ready, userId, household, segments, router]);

  return null;
}

/** Tapping a notification opens its screen (e.g. the daily reminder → New expense). */
function NotificationRouter() {
  const router = useRouter();
  const { userId } = useAuth();
  const { household } = useHousehold();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const id = response?.notification.request.identifier;
    const url = response?.notification.request.content.data?.url;
    if (!id || handled.current === id || !userId || !household || typeof url !== "string") return;
    handled.current = id;
    setTimeout(() => router.push(url as never), 300);
  }, [response, userId, household, router]);
  return null;
}

function RootStack() {
  const { c, scheme } = useTheme();
  const { ready } = useAuth();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const modal = { presentation: "modal" as const, headerShown: false, contentStyle: { backgroundColor: c.bg } };
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="household-setup" />
        <Stack.Screen name="add-expense" options={modal} />
        <Stack.Screen name="edit-expense" options={modal} />
        <Stack.Screen name="add-settlement" options={modal} />
        <Stack.Screen name="budget-form" options={modal} />
        <Stack.Screen name="recurring-form" options={modal} />
        <Stack.Screen name="recurring" />
        <Stack.Screen name="sync-queue" options={modal} />
      </Stack>
      <AuthGuard />
      <NotificationRouter />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });
  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <HouseholdProvider>
        <AppProvider>
          <RootStack />
        </AppProvider>
      </HouseholdProvider>
    </AuthProvider>
  );
}
