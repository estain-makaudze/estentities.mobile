import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useApplications } from "../../store/applicationStore";
import { useCollections } from "../../store/collectionStore";

function PendingBadge({ color, size }: { color: string; size: number }) {
  const { collections } = useCollections();
  const count = collections.filter((c) => c.status === "not_recorded").length;
  return (
    <View>
      <Ionicons name="cash-outline" size={size} color={color} />
      {count > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

function DraftBadge({ color, size }: { color: string; size: number }) {
  const { applications } = useApplications();
  const count = applications.filter((a) => a.status === "draft").length;
  return (
    <View>
      <Ionicons name="document-text-outline" size={size} color={color} />
      {count > 0 && (
        <View style={[badge.dot, { backgroundColor: "#7C3AED" }]}>
          <Text style={badge.text}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

const badge = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#F59E0B",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
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
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="collect"
        options={{
          title: "Collections",
          tabBarLabel: "Collect",
          tabBarIcon: ({ color, size }) => <PendingBadge color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: "Applications",
          tabBarLabel: "Apply",
          tabBarIcon: ({ color, size }) => <DraftBadge color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: "Invoices",
          tabBarLabel: "Invoices",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: "Schedules",
          tabBarLabel: "Schedules",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messaging"
        options={{
          title: "Message Clients",
          tabBarLabel: "Messaging",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
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

