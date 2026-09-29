import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { BarChart, CumulativeChart, DonutChart, Legend } from "../../components/charts";
import { TransactionRow } from "../../components/TransactionRow";
import { Avatar, Card, EmptyState, Header, IconTile, Money, Screen, SectionHeader, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { categoryTotals, dailyTotals, expensesBetween, monthlyTotals } from "../../db/queries";
import { PALETTE, useTheme } from "../../theme";
import { addMonths, monthKey, monthLong, monthRange, monthShort, parseDate, today } from "../../utils/dates";
import { formatMoney } from "../../utils/format";
import { computeInsights, type Insight } from "../../utils/insights";

function cumulative(daily: { date: string; total: number }[], days: number, upTo: number): number[] {
  const byDay = new Array(days).fill(0);
  for (const d of daily) byDay[parseDate(d.date).getDate() - 1] += d.total;
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < upTo; i++) out.push((run += byDay[i]));
  return out;
}

export default function StatsScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { household, members, currency, userName, userColor } = useHousehold();
  const { categoryById, budgets } = useApp();
  const version = useDataVersion();
  const hh = household?.id ?? "";
  const current = monthKey(today());
  const [month, setMonth] = useState(current);

  const totalBudget = budgets.find((b) => b.categoryId === null)?.amount ?? null;

  const d = useMemo(() => {
    void version;
    const months = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 5));
    const series = monthlyTotals(hh, monthRange(months[0]).from, monthRange(current).to);
    const bars = months.map((m) => ({
      key: m,
      label: monthShort(m),
      a: series.find((s) => s.month === m)?.total ?? 0,
      b: totalBudget,
    }));

    const { from, to, days } = monthRange(month);
    const isCurrent = month === current;
    const upTo = isCurrent ? parseDate(today()).getDate() : days;
    const spent = bars.find((b) => b.key === month)?.a ?? expensesBetween(hh, from, to).reduce((a, e) => a + e.amount, 0);
    const prevKey = addMonths(month, -1);
    const prev = monthRange(prevKey);
    const prevDaily = dailyTotals(hh, prev.from, prev.to);
    const prevTotal = prevDaily.reduce((a, x) => a + x.total, 0);

    const cats = categoryTotals(hh, from, to);
    const top = cats.slice(0, 5);
    const rest = cats.slice(5).reduce((a, x) => a + x.total, 0);
    const slices = top.map((t, i) => {
      const cat = categoryById(t.categoryId);
      return {
        key: t.categoryId ?? "none",
        label: cat ? `${cat.emoji} ${cat.name}` : "📦 Uncategorised",
        value: t.total,
        count: t.count,
        color: cat?.color ?? PALETTE[i % PALETTE.length],
      };
    });
    if (rest > 0) slices.push({ key: "rest", label: "Everything else", value: rest, count: 0, color: c.muted });

    // Paid vs fair share per member
    const exps = expensesBetween(hh, from, to);
    const paid: Record<string, number> = {};
    const share: Record<string, number> = {};
    for (const e of exps) {
      paid[e.paidBy] = (paid[e.paidBy] ?? 0) + e.amount;
      if (!e.splits || e.splits.length === 0) share[e.paidBy] = (share[e.paidBy] ?? 0) + e.amount;
      else for (const s of e.splits) share[s.userId] = (share[s.userId] ?? 0) + (e.amount * s.percentage) / 100;
    }
    const people = [...new Set([...members.map((m) => m.id), ...Object.keys(paid)])]
      .map((id) => ({ id, paid: paid[id] ?? 0, share: share[id] ?? 0 }))
      .filter((p) => p.paid > 0 || p.share > 0)
      .sort((a, b) => b.paid - a.paid);

    const insights: Insight[] = hh ? computeInsights({ householdId: hh, currency, month, userName }) : [];

    return {
      bars, spent, prevTotal, slices, people, insights, days,
      cum: cumulative(dailyTotals(hh, from, to), days, upTo),
      prevCum: cumulative(prevDaily, prev.days, Math.min(prev.days, days)),
      history: exps.slice(0, 15),
    };
  }, [hh, month, current, totalBudget, categoryById, members, currency, userName, c.muted, version]);

  const delta = d.spent - d.prevTotal;
  const toneColor = { good: c.success, warn: c.warning, bad: c.danger, info: c.primary };

  return (
    <Screen bottomInset={110}>
      <Header title="Statistics" back={false} />

      {/* Summary card */}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconTile icon="wallet" color={c.primary} size={50} />
        <View style={{ flex: 1 }}>
          <T variant="caption">Spent in {monthLong(month)}</T>
          <Money amount={d.spent} currency={currency} variant="h1" />
        </View>
        {d.prevTotal > 0 && (
          <View style={{ alignItems: "flex-end" }}>
            <T variant="bodyStrong" color={delta > 0 ? c.danger : c.success}>
              {formatMoney(delta, currency, { sign: true })}
            </T>
            <T variant="caption">vs {monthShort(addMonths(month, -1))}</T>
          </View>
        )}
      </Card>

      {/* Monthly bars */}
      <Card style={{ marginTop: 16 }}>
        <Legend items={[{ color: c.primary, label: "Spent" }, ...(totalBudget ? [{ color: c.muted, label: "Budget" }] : [])]} />
        <View style={{ marginTop: 16 }}>
          <BarChart data={d.bars} selected={month} onSelect={setMonth} />
        </View>
      </Card>

      {/* Category donut */}
      <SectionHeader title="Where the money went" />
      <Card>
        {d.slices.length === 0 ? (
          <EmptyState icon="pie-chart-outline" title={`Nothing spent in ${monthShort(month)}`} />
        ) : (
          <>
            <View style={{ alignItems: "center", marginVertical: 8 }}>
              <DonutChart
                segments={d.slices.map((s) => ({ value: s.value, color: s.color }))}
                centerValue={formatMoney(d.spent, currency, { compact: true })}
                centerLabel={`${d.slices.reduce((a, s) => a + s.count, 0) || ""} expenses`}
              />
            </View>
            {d.slices.map((s) => (
              <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
                <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{s.label}</T>
                <T variant="caption" style={{ width: 42, textAlign: "right" }}>
                  {((s.value / d.spent) * 100).toFixed(0)}%
                </T>
                <Money amount={s.value} currency={currency} style={{ minWidth: 88, textAlign: "right" }} />
              </View>
            ))}
          </>
        )}
      </Card>

      {/* Pace */}
      <SectionHeader title="Spending pace" />
      <Card>
        <Legend
          items={[
            { color: c.primary, label: monthShort(month) },
            { color: c.muted, label: monthShort(addMonths(month, -1)) },
            ...(totalBudget ? [{ color: c.danger, label: "Budget" }] : []),
          ]}
        />
        <View style={{ marginTop: 12 }}>
          <CumulativeChart days={d.days} values={d.cum} compare={d.prevCum} budget={totalBudget} currency={currency} />
        </View>
      </Card>

      {/* Insights */}
      {d.insights.length > 0 && (
        <>
          <SectionHeader title="Insights" />
          <View style={{ gap: 10 }}>
            {d.insights.map((i) => (
              <Card key={i.id} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <IconTile icon={i.icon as never} color={toneColor[i.tone]} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong">{i.title}</T>
                  <T variant="caption">{i.body}</T>
                </View>
              </Card>
            ))}
          </View>
        </>
      )}

      {/* Members */}
      {d.people.length > 0 && members.length > 1 && (
        <>
          <SectionHeader title="Who paid · fair share" />
          <Card>
            {d.people.map((p) => {
              const diff = p.paid - p.share;
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                  <Avatar name={userName(p.id)} color={userColor(p.id)} size={36} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{userName(p.id)}</T>
                    <T variant="caption">
                      Paid {formatMoney(p.paid, currency)} · share {formatMoney(p.share, currency)}
                    </T>
                  </View>
                  <T variant="caption" color={Math.abs(diff) < 0.01 ? c.sub : diff > 0 ? c.success : c.danger}>
                    {Math.abs(diff) < 0.01 ? "even" : formatMoney(diff, currency, { sign: true })}
                  </T>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionHeader title="History" action="See All" onAction={() => router.push("/(tabs)/expenses")} />
      <Card style={{ paddingVertical: 6 }}>
        {d.history.length === 0 ? (
          <View style={{ padding: 16, alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" }}>
            <Ionicons name="calendar-outline" size={18} color={c.sub} />
            <T variant="caption">No expenses in {monthLong(month)}</T>
          </View>
        ) : (
          d.history.map((e) => <TransactionRow key={e.id} activity={{ kind: "expense", item: e }} />)
        )}
      </Card>
    </Screen>
  );
}
