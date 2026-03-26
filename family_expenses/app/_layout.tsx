import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppProvider } from "../context/AppContext";

export default function RootLayout() {
  return (
    <AppProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#4A90D9",
          tabBarInactiveTintColor: "#8E8E93",
          headerStyle: { backgroundColor: "#4A90D9" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="expenses"
          options={{
            title: "Expenses",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settlements"
          options={{
            title: "Settlements",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="swap-horizontal" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: "Users",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
        {/* Hidden modal screens */}
        <Tabs.Screen name="add-expense" options={{ href: null }} />
        <Tabs.Screen name="add-settlement" options={{ href: null }} />
      </Tabs>
    </AppProvider>
  );
}
