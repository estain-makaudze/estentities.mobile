import { Tabs } from "expo-router";
import { TabBar } from "../../components/TabBar";
import { useTheme } from "../../theme";

export default function TabLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="stats" options={{ title: "Statistics" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets" }} />
      <Tabs.Screen name="household" options={{ title: "Family" }} />
      {/* Reachable from Home / Family but not shown in the tab bar */}
      <Tabs.Screen name="expenses" options={{ title: "Transactions" }} />
      <Tabs.Screen name="settlements" options={{ title: "Balances" }} />
      <Tabs.Screen name="settings" options={{ title: "Categories" }} />
      <Tabs.Screen name="users" options={{ href: null }} />
    </Tabs>
  );
}
