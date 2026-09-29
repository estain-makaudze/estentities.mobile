import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import { Card, EmptyState, Header, IconTile, Money, Row, Screen, SectionHeader, T } from "../components/ui";
import { useApp } from "../context/AppContext";
import { useHousehold } from "../context/HouseholdContext";
import { PALETTE, useTheme } from "../theme";
import { daysBetween, friendlyDate, today } from "../utils/dates";
import { formatMoney } from "../utils/format";
import { frequencyLabel } from "../utils/recurring";

/** Recurring bills: rent, subscriptions, school fees — added automatically when due. */
export default function RecurringScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { recurring, categoryById } = useApp();
  const { currency, userName } = useHousehold();
  const active = recurring.filter((r) => r.active);
  const paused = recurring.filter((r) => !r.active);
  const monthly = active.reduce((a, r) => {
    const f = r.frequency === "week" ? 52 / 12 : r.frequency === "year" ? 1 / 12 : 1;
    return a + (r.amount * f) / r.intervalN;
  }, 0);

  const item = (r: (typeof recurring)[number], i: number) => {
    const cat = categoryById(r.categoryId);
    const inDays = daysBetween(today(), r.nextDue);
    return (
      <Row key={r.id} style={{ paddingVertical: 10 }} onPress={() => router.push({ pathname: "/recurring-form", params: { id: r.id } })}>
        <IconTile emoji={cat?.emoji ?? "🔁"} color={cat?.color ?? PALETTE[i % PALETTE.length]} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>{r.description}</T>
          <T variant="caption">
            {frequencyLabel(r)} · {r.active ? (inDays <= 0 ? "due today" : `next ${friendlyDate(r.nextDue)}`) : "paused"}
          </T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Money amount={r.amount} currency={currency} />
          <T variant="caption">{userName(r.paidBy)} pays</T>
        </View>
      </Row>
    );
  };

  return (
    <Screen>
      <Header
        title="Recurring bills"
        right={
          <Pressable hitSlop={10} onPress={() => router.push("/recurring-form")}>
            <Ionicons name="add-circle" size={28} color={c.primary} />
          </Pressable>
        }
      />
      <Card style={{ backgroundColor: c.dark }}>
        <T variant="caption" color={c.muted}>Fixed commitments</T>
        <T variant="h1" color={c.onDark}>{formatMoney(monthly, currency)} / month</T>
        <T variant="caption" color={c.muted}>
          Due bills are added automatically, even offline. You get a reminder the day before.
        </T>
      </Card>

      {recurring.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="No recurring bills"
          body="Add rent, school fees, DSTV, internet… so they're tracked every period without typing them in."
          action="Add a bill"
          onAction={() => router.push("/recurring-form")}
        />
      ) : (
        <>
          <SectionHeader title="Active" />
          <Card style={{ paddingVertical: 4 }}>{active.map(item)}</Card>
          {paused.length > 0 && (
            <>
              <SectionHeader title="Paused" />
              <Card style={{ paddingVertical: 4 }}>{paused.map(item)}</Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
