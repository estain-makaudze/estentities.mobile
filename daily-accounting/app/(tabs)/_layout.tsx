// Tab navigator for Daily Accounting app
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useQueue } from "../../store/queueStore";

function QueueTabIcon({ color, size }: { color: string; size: number }) {
  const { queue } = useQueue();
  const count = queue.filter((i) => i.status === "pending" || i.status === "failed").length;
  return (
    <View>
      <Ionicons name="cloud-upload-outline" size={size} color={color} />
      {count > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

const badge = StyleSheet.create({
  dot: {
    position: "absolute", top: -4, right: -8,
    backgroundColor: "#EF4444", borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: "center", alignItems: "center",
    paddingHorizontal: 3,
  },
  text: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: { backgroundColor: "#FFFFFF" },
        headerStyle: { backgroundColor: "#2563EB" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "New Entry",
          tabBarLabel: "Entry",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Sync Queue",
          tabBarLabel: "Queue",
          tabBarIcon: ({ color, size }) => <QueueTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

