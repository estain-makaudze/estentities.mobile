import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, useTheme } from "../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "home", off: "home-outline" },
  stats: { on: "pie-chart", off: "pie-chart-outline" },
  budgets: { on: "wallet", off: "wallet-outline" },
  household: { on: "people", off: "people-outline" },
};
const ORDER = ["index", "stats", "+", "budgets", "household"];

/** Floating white pill tab bar with a dark centre "+" button (as in the mock). */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const current = state.routes[state.index]?.name;

  return (
    <View style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(insets.bottom, 12) }}>
      <View
        style={[
          { flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: c.card,
            borderRadius: 28, height: 64, paddingHorizontal: 8 },
          cardShadow(c),
          { shadowOpacity: 0.12, elevation: 8 },
        ]}
      >
        {ORDER.map((name) => {
          if (name === "+") {
            return (
              <Pressable
                key="+"
                accessibilityLabel="Add expense"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/add-expense");
                }}
                style={({ pressed }) => ({
                  width: 56, height: 56, borderRadius: 20, backgroundColor: c.dark, marginTop: -30,
                  alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }],
                  ...cardShadow(c), shadowOpacity: 0.25, elevation: 10,
                })}
              >
                <Ionicons name="add" size={30} color={c.onDark} />
              </Pressable>
            );
          }
          const route = state.routes.find((r) => r.name === name);
          if (!route) return null;
          const focused = current === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              hitSlop={8}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name={focused ? TABS[name].on : TABS[name].off} size={24} color={focused ? c.ink : c.muted} />
              {focused && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.primary, marginTop: 4 }} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
