import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { CategoriesProvider } from "../store/categoriesStore";
import { QueueProvider } from "../store/queueStore";
import { SettingsProvider } from "../store/settingsStore";

// Configure how notifications are displayed when the app is in the foreground
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
    // Request notification permissions early (Android 13+ requires explicit permission)
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync().catch(() => {});
    }
  }, []);

  return (
    <SettingsProvider>
      <CategoriesProvider>
        <QueueProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </QueueProvider>
      </CategoriesProvider>
    </SettingsProvider>
  );
}
