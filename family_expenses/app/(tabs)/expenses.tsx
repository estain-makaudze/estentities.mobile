import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ScrollView, SectionList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TransactionRow } from "../../components/TransactionRow";
import { Chip, EmptyState, Header, Money, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { recentActivity, type Activity } from "../../db/queries";
import { fonts, radius, useTheme } from "../../theme";
import { friendlyDate } from "../../utils/dates";

/** All transactions: search, category filter, grouped by day. */
export default function TransactionsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { household, currency } = useHousehold();
  const { categories } = useApp();
  const version = useDataVersion();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const hh = household?.id ?? "";

  const sections = useMemo(() => {
    void version;
    let items: Activity[] = recentActivity(hh, 2000, search);
    if (cat) items = items.filter((a) => a.kind === "expense" && a.item.categoryId === cat);
    const groups = new Map<string, Activity[]>();
    for (const a of items) {
      const list = groups.get(a.item.date) ?? [];
      list.push(a);
      groups.set(a.item.date, list);
    }
    return [...groups.entries()].map(([date, data]) => ({
      date,
      total: data.reduce((s, a) => s + (a.kind === "expense" ? a.item.amount : 0), 0),
      data,
    }));
  }, [hh, search, cat, version]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 }}>
      <Header title="Transactions" />
      <View
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderRadius: radius.md,
                 paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: c.line }}
      >
        <Ionicons name="search" size={18} color={c.sub} />
        <TextInput
          placeholder="Search expenses"
          placeholderTextColor={c.sub}
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, paddingVertical: 12, fontFamily: fonts.medium, fontSize: 15, color: c.ink }}
        />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
          <Chip label="All" active={!cat} onPress={() => setCat(null)} />
          {categories.map((x) => (
            <Chip key={x.id} label={`${x.emoji} ${x.name}`} active={cat === x.id} onPress={() => setCat(cat === x.id ? null : x.id)} />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(a) => a.item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 4 }}>
            <T variant="label" muted>{friendlyDate(section.date)}</T>
            {section.total > 0 && <Money amount={-section.total} currency={currency} variant="caption" />}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 6 }}>
            <TransactionRow activity={item} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState icon="search" title={search || cat ? "No matching transactions" : "No transactions yet"} />
        }
      />
    </View>
  );
}
