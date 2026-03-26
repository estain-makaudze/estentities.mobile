import { Stack } from "expo-router";
import { useEffect } from "react";
import { setupNotifications } from "../utils/notifications";
import { ApplicationProvider } from "../store/applicationStore";
import { CacheProvider } from "../store/cacheStore";
import { CollectionProvider } from "../store/collectionStore";
import { SettingsProvider } from "../store/settingsStore";

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(() => {});
  }, []);

  return (
    <SettingsProvider>
      <CacheProvider>
        <CollectionProvider>
          <ApplicationProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="new-application"
                options={{
                  presentation: "fullScreenModal",
                  animation: "slide_from_bottom",
                  headerShown: false,
                }}
              />
            </Stack>
          </ApplicationProvider>
        </CollectionProvider>
      </CacheProvider>
    </SettingsProvider>
  );
}
