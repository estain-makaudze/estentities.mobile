import { Stack } from "expo-router";
import { useEffect } from "react";
import { setupNotifications } from "../utils/notifications";
import { ApplicationProvider } from "../store/applicationStore";
import { CacheProvider } from "../store/cacheStore";
import { CollectionProvider } from "../store/collectionStore";
import { MessageProvider } from "../store/messageStore";
import { SettingsProvider } from "../store/settingsStore";
import { SyncQueueProvider } from "../store/syncQueue";

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(() => {});
  }, []);

  return (
    <SettingsProvider>
      <SyncQueueProvider>
        <CacheProvider>
          <CollectionProvider>
            <ApplicationProvider>
              <MessageProvider>
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
                  <Stack.Screen
                    name="sync-queue"
                    options={{
                      presentation: "modal",
                      animation: "slide_from_bottom",
                      headerShown: false,
                    }}
                  />
                </Stack>
              </MessageProvider>
            </ApplicationProvider>
          </CollectionProvider>
        </CacheProvider>
      </SyncQueueProvider>
    </SettingsProvider>
  );
}
