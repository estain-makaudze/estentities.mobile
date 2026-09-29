import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import type { Activity } from "../db/queries";
import { PALETTE, useTheme } from "../theme";
import { friendlyDate } from "../utils/dates";
import { IconTile, Money, Row, T } from "./ui";

/** One line of "Last Transactions": tile · title/date · amount/subtitle. */
export function TransactionRow({ activity }: { activity: Activity }) {
  const router = useRouter();
  const { c } = useTheme();
  const { userId } = useAuth();
  const { currency, userName } = useHousehold();
  const { categoryById } = useApp();

  if (activity.kind === "settlement") {
    const s = activity.item;
    const mine = s.toUserId === userId;
    return (
      <Row style={{ paddingVertical: 10 }} onPress={() => router.push("/(tabs)/settlements")}>
        <IconTile icon="swap-horizontal" color={c.success} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>{userName(s.fromUserId)} → {userName(s.toUserId)}</T>
          <T variant="caption">{friendlyDate(s.date)}</T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Money amount={s.amount} currency={currency} sign={mine} color={mine ? c.success : c.ink} />
          <T variant="caption">Settle up</T>
        </View>
      </Row>
    );
  }

  const e = activity.item;
  const cat = categoryById(e.categoryId);
  const shared = e.splits && e.splits.length > 0;
  return (
    <Row style={{ paddingVertical: 10 }} onPress={() => router.push({ pathname: "/add-expense", params: { id: e.id } })}>
      <IconTile emoji={cat?.emoji ?? "📦"} color={cat?.color ?? PALETTE[8]} />
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" numberOfLines={1}>{e.description}</T>
        <T variant="caption">{friendlyDate(e.date)}{e.recurringId ? " · Recurring" : ""}</T>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: "40%" }}>
        <Money amount={-e.amount} currency={currency} />
        <T variant="caption" numberOfLines={1}>
          {userName(e.paidBy)} paid{shared ? " · split" : ""}
        </T>
      </View>
    </Row>
  );
}
