import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { AuthProvider } from "../store/authStore";
import { CategoriesProvider } from "../store/categoriesStore";
import { DebtsProvider } from "../store/debtsStore";
import { QueueProvider } from "../store/queueStore";
import { SettingsProvider } from "../store/settingsStore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync().catch(() => {});
    }
  }, []);

  return (
    <AuthProvider>
      <SettingsProvider>
        <CategoriesProvider>
          <DebtsProvider>
            <QueueProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </QueueProvider>
          </DebtsProvider>
        </CategoriesProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
