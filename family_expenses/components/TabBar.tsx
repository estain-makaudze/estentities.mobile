import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, fonts, useTheme } from "../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Record<string, { on: IconName; off: IconName; label: string }> = {
  index: { on: "home", off: "home-outline", label: "Home" },
  expenses: { on: "receipt", off: "receipt-outline", label: "History" },
  balance: { on: "scale", off: "scale-outline", label: "Balance" },
  stats: { on: "pie-chart", off: "pie-chart-outline", label: "Stats" },
};
const ORDER = ["index", "expenses", "+", "balance", "stats"];

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
              style={{ width: 56, height: 52, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name={focused ? TABS[name].on : TABS[name].off} size={22} color={focused ? c.primary : c.sub} />
              <Text style={{ fontFamily: focused ? fonts.bold : fonts.medium, fontSize: 10.5, marginTop: 2, color: focused ? c.primary : c.sub }}>
                {TABS[name].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
