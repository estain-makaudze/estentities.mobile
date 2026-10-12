import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TransactionRow } from "../../components/TransactionRow";
import { Chip, EmptyState, Header, Money, Segmented, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements, type Activity } from "../../db/queries";
import { fonts, radius, useTheme } from "../../theme";
import { friendlyDate, monthLong } from "../../utils/dates";
import { formatMoney } from "../../utils/format";

type Kind = "all" | "expense" | "settlement";

/**
 * Full history: every expense and every payment, newest first, grouped by day.
 * Search matches description, note, category, who paid / received, and amount.
 */
export default function TransactionsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { household, currency, userName } = useHousehold();
  const { categories, categoryById } = useApp();
  const version = useDataVersion();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [cat, setCat] = useState<string | null>(null);
  const hh = household?.id ?? "";

  const all = useMemo<Activity[]>(() => {
    void version;
    const exps: Activity[] = allExpenses(hh).map((item) => ({ kind: "expense", item }));
    const sets: Activity[] = allSettlements(hh).map((item) => ({ kind: "settlement", item }));
    return [...exps, ...sets].sort((a, b) => b.item.date.localeCompare(a.item.date));
  }, [hh, version]);

  const { sections, count, spent, paid } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (a: Activity) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (cat && (a.kind !== "expense" || a.item.categoryId !== cat)) return false;
      if (!q) return true;
      const amount = a.item.amount.toFixed(2);
      const hay =
        a.kind === "expense"
          ? [a.item.description, a.item.note, categoryById(a.item.categoryId)?.name, userName(a.item.paidBy)]
          : ["payment settle", a.item.note, userName(a.item.fromUserId), userName(a.item.toUserId)];
      return amount.includes(q.replace(/[^0-9.]/g, "") || "\u0000") || hay.some((h) => h?.toLowerCase().includes(q));
    };
    const list = all.filter(matches);
    const groups = new Map<string, Activity[]>();
    for (const a of list) {
      const g = groups.get(a.item.date) ?? [];
      g.push(a);
      groups.set(a.item.date, g);
    }
    let prevMonth = "";
    const sections = [...groups.entries()].map(([date, data]) => {
      const month = date.slice(0, 7);
      const monthHeader = month !== prevMonth ? monthLong(month) : null;
      prevMonth = month;
      return {
        date,
        monthHeader,
        spent: data.reduce((s, a) => s + (a.kind === "expense" ? a.item.amount : 0), 0),
        data,
      };
    });
    return {
      sections,
      count: list.length,
      spent: list.reduce((s, a) => s + (a.kind === "expense" ? a.item.amount : 0), 0),
      paid: list.reduce((s, a) => s + (a.kind === "settlement" ? a.item.amount : 0), 0),
    };
  }, [all, search, kind, cat, categoryById, userName]);

  const filtered = !!search.trim() || kind !== "all" || !!cat;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 }}>
      <Header title="Transactions" back={false} />

      <View
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderRadius: radius.md,
                 paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: c.line }}
      >
        <Ionicons name="search" size={18} color={c.sub} />
        <TextInput
          placeholder="Search description, person, amount…"
          placeholderTextColor={c.sub}
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, paddingVertical: 12, fontFamily: fonts.medium, fontSize: 15, color: c.ink }}
        />
        {!!search && (
          <Pressable hitSlop={10} onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={c.sub} />
          </Pressable>
        )}
      </View>

      <View style={{ marginTop: 12 }}>
        <Segmented<Kind>
          value={kind}
          onChange={(k) => { setKind(k); if (k === "settlement") setCat(null); }}
          options={[{ value: "all", label: "All" }, { value: "expense", label: "Expenses" }, { value: "settlement", label: "Payments" }]}
        />
      </View>

      {kind !== "settlement" && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            <Chip label="All categories" active={!cat} onPress={() => setCat(null)} />
            {categories.map((x) => (
              <Chip key={x.id} label={`${x.emoji} ${x.name}`} active={cat === x.id} onPress={() => setCat(cat === x.id ? null : x.id)} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <T variant="caption">{count} {filtered ? "matching" : "in total"}</T>
        <T variant="caption">
          {spent > 0 ? `Spent ${formatMoney(spent, currency)}` : ""}
          {spent > 0 && paid > 0 ? " · " : ""}
          {paid > 0 ? `Paid back ${formatMoney(paid, currency)}` : ""}
        </T>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(a) => a.item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <View>
            {section.monthHeader && (
              <T variant="h3" style={{ marginTop: 20 }}>{section.monthHeader}</T>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, marginBottom: 2 }}>
              <T variant="label" muted>{friendlyDate(section.date)}</T>
              {section.spent > 0 && <Money amount={-section.spent} currency={currency} variant="caption" />}
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 6 }}>
            <TransactionRow activity={item} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState icon="search" title={filtered ? "Nothing matches" : "No transactions yet"} body={filtered ? "Try another word or clear the filters." : undefined} />
        }
      />
    </View>
  );
}
