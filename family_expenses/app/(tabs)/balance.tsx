import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, Card, Chip, EmptyState, Header, Money, Segmented, T } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements } from "../../db/queries";
import { fonts, radius, useTheme } from "../../theme";
import { computeDebtSummary, computeLedger, computeNetBalances, type LedgerRow } from "../../utils/balance";
import { friendlyDate } from "../../utils/dates";
import { formatMoney } from "../../utils/format";

type Filter = "all" | "expense" | "payment";

/**
 * Balance ledger: every shared expense and every payment for one member,
 * as a table. Expenses move the balance, payments cancel it out, and the
 * running column ends at the member's current balance.
 */
export default function BalanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { userId } = useAuth();
  const { household, members, currency, userName, userColor } = useHousehold();
  const version = useDataVersion();
  const hh = household?.id ?? "";
  const [who, setWho] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showUnshared, setShowUnshared] = useState(false);
  const person = who ?? userId ?? members[0]?.id ?? "";
  const isMe = person === userId;

  const d = useMemo(() => {
    void version;
    const expenses = allExpenses(hh);
    const settlements = allSettlements(hh);
    const balances = computeNetBalances(expenses, settlements, members.map((m) => m.id));
    const ledger = person ? computeLedger(expenses, settlements, person, { includeUnshared: showUnshared }) : [];
    return {
      balance: Math.round((balances[person] ?? 0) * 100) / 100,
      debts: computeDebtSummary(balances).filter((x) => x.fromUserId === person || x.toUserId === person),
      ledger,
      added: ledger.filter((r) => r.kind === "expense" && r.effect < 0).reduce((a, r) => a - r.effect, 0),
      lent: ledger.filter((r) => r.kind === "expense" && r.effect > 0).reduce((a, r) => a + r.effect, 0),
      paidOut: ledger.filter((r) => r.kind === "payment" && r.effect > 0).reduce((a, r) => a + r.effect, 0),
      received: ledger.filter((r) => r.kind === "payment" && r.effect < 0).reduce((a, r) => a - r.effect, 0),
    };
  }, [hh, members, person, showUnshared, version]);

  // Newest first on screen; the running balance was computed oldest-first.
  const rows = useMemo(
    () => [...d.ledger].reverse().filter((r) => filter === "all" || r.kind === filter),
    [d.ledger, filter]
  );

  const name = isMe ? "You" : userName(person);
  const settled = Math.abs(d.balance) < 0.01;
  const money = (n: number, sign = false) => formatMoney(n, currency, { sign });

  const header = (
    <View>
      <Header title="Balance" back={false} />

      {members.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {members.map((m) => (
            <Chip key={m.id} label={m.id === userId ? "You" : m.name} active={m.id === person} onPress={() => setWho(m.id)} />
          ))}
        </ScrollView>
      )}

      {/* Summary */}
      <Card style={{ alignItems: "center", paddingVertical: 20, gap: 4 }}>
        <Avatar name={userName(person)} color={userColor(person)} size={44} />
        <T variant="caption" style={{ marginTop: 6 }}>
          {settled ? `${name} ${isMe ? "are" : "is"} all settled` : d.balance > 0 ? `${name} ${isMe ? "are" : "is"} owed` : `${name} ${isMe ? "owe" : "owes"}`}
        </T>
        <Money amount={Math.abs(d.balance)} currency={currency} variant="display"
               color={settled ? c.ink : d.balance > 0 ? c.success : c.danger} />
        {d.debts.map((x) => (
          <T key={`${x.fromUserId}-${x.toUserId}`} variant="caption">
            {userName(x.fromUserId)} → {userName(x.toUserId)}: {money(x.amount)}
          </T>
        ))}
        {!settled && members.length > 1 && (
          <Button title="Settle up" variant="dark" style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 28 }}
                  onPress={() => {
                    const debt = d.debts[0];
                    router.push(debt
                      ? { pathname: "/add-settlement", params: { fromUserId: debt.fromUserId, toUserId: debt.toUserId, suggestedAmount: debt.amount.toFixed(2) } }
                      : "/add-settlement");
                  }} />
        )}
      </Card>

      {/* How we got here */}
      <Card style={{ marginTop: 12, gap: 8 }}>
        <SummaryLine label={`${isMe ? "Your" : `${name}'s`} share of others' expenses`} value={-d.added} money={money} />
        <SummaryLine label={`Others' share of what ${isMe ? "you" : name} paid`} value={d.lent} money={money} />
        <SummaryLine label={`Payments ${isMe ? "you" : name} sent`} value={d.paidOut} money={money} />
        <SummaryLine label={`Payments ${isMe ? "you" : name} received`} value={-d.received} money={money} />
        <View style={{ height: 1, backgroundColor: c.line }} />
        <SummaryLine label="Balance" value={d.balance} money={money} bold />
      </Card>

      <View style={{ marginTop: 16, gap: 10 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[{ value: "all", label: "All" }, { value: "expense", label: "Expenses" }, { value: "payment", label: "Payments" }]}
        />
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <T variant="caption" style={{ flex: 1 }}>Show expenses that weren&apos;t split</T>
          <Switch value={showUnshared} onValueChange={setShowUnshared} trackColor={{ true: c.primary }} />
        </View>
      </View>

      {/* Table header */}
      <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, marginTop: 8,
                     backgroundColor: c.cardAlt, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }}>
        <T variant="label" muted style={{ width: 56 }}>Date</T>
        <T variant="label" muted style={{ flex: 1 }}>Item</T>
        <T variant="label" muted style={{ width: 78, textAlign: "right" }}>Effect</T>
        <T variant="label" muted style={{ width: 84, textAlign: "right" }}>Balance</T>
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 + insets.bottom }}
      data={rows}
      keyExtractor={(r) => `${r.kind}-${r.id}`}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <LedgerLine row={item} last={index === rows.length - 1} userName={userName} money={money}
                    onPress={() => router.push(item.kind === "expense"
                      ? { pathname: "/add-expense", params: { id: item.id } }
                      : "/(tabs)/settlements")} />
      )}
      ListEmptyComponent={
        <View style={{ backgroundColor: c.card, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md }}>
          <EmptyState icon="scale-outline" title="Nothing on the ledger yet" body="Shared expenses and payments will appear here." />
        </View>
      }
    />
  );
}

function SummaryLine({ label, value, money, bold }: { label: string; value: number; money: (n: number, s?: boolean) => string; bold?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <T variant={bold ? "bodyStrong" : "caption"} style={{ flex: 1 }}>{label}</T>
      <T variant={bold ? "bodyStrong" : "caption"} color={Math.abs(value) < 0.005 ? c.sub : value > 0 ? c.success : c.danger}
         style={{ fontFamily: bold ? fonts.extrabold : fonts.semibold }}>
        {Math.abs(value) < 0.005 ? money(0) : money(value, true)}
      </T>
    </View>
  );
}

function LedgerLine({
  row, last, userName, money, onPress,
}: {
  row: LedgerRow; last: boolean; userName: (id: string) => string;
  money: (n: number, s?: boolean) => string; onPress: () => void;
}) {
  const { c } = useTheme();
  const isPayment = row.kind === "payment";
  const sub = isPayment
    ? `${userName(row.fromUserId)} → ${userName(row.toUserId!)} · ${money(row.amount)}`
    : `${money(row.amount)} paid by ${userName(row.fromUserId)}${row.shared ? ` · share ${money(row.share)}` : " · not split"}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11,
        backgroundColor: pressed ? c.cardAlt : c.card, borderTopWidth: 1, borderTopColor: c.line,
        borderBottomLeftRadius: last ? radius.md : 0, borderBottomRightRadius: last ? radius.md : 0,
      })}
    >
      <T variant="caption" style={{ width: 56 }}>{friendlyDate(row.date)}</T>
      <View style={{ flex: 1, paddingRight: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: isPayment ? c.successSoft : c.primarySoft }}>
            <T variant="caption" color={isPayment ? c.success : c.primary} style={{ fontSize: 10.5, fontFamily: fonts.bold }}>
              {isPayment ? "PAID" : "EXP"}
            </T>
          </View>
          <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{row.description}</T>
        </View>
        <T variant="caption" numberOfLines={1} style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</T>
      </View>
      <T variant="bodyStrong" style={{ width: 78, textAlign: "right", fontSize: 13.5 }}
         color={Math.abs(row.effect) < 0.005 ? c.sub : row.effect > 0 ? c.success : c.danger}>
        {Math.abs(row.effect) < 0.005 ? "—" : money(row.effect, true)}
      </T>
      <T variant="bodyStrong" style={{ width: 84, textAlign: "right", fontSize: 13.5, fontFamily: fonts.extrabold }}
         color={Math.abs(row.running) < 0.005 ? c.ink : row.running > 0 ? c.success : c.danger}>
        {money(row.running)}
      </T>
    </Pressable>
  );
}
