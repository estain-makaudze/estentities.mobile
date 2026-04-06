import { Stack } from "expo-router";
import { AuthProvider } from "../store/authStore";
import { CategoriesProvider } from "../store/categoriesStore";
import { DebtsProvider } from "../store/debtsStore";
import { QueueProvider } from "../store/queueStore";
import { SettingsProvider } from "../store/settingsStore";

export default function RootLayout() {

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
