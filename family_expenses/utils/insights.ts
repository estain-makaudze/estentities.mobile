import {
  categoryTotals, dailyTotals, expensesBetween, monthlyCategoryTotals, paidByTotals, totalBetween,
} from "../db/queries";
import { listAll } from "../db/repo";
import type { Budget, Category, Recurring } from "../types";
import { WEEKDAYS, addMonths, addPeriod, monthKey, monthRange, parseDate, today } from "./dates";
import { formatMoney } from "./format";

export type Insight = {
  id: string;
  icon: string; // Ionicons name
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  body: string;
};

type Ctx = {
  householdId: string;
  currency: string;
  month: string; // YYYY-MM
  userName: (id: string) => string;
};

/**
 * Plain-language analysis of how the family is spending. Computed locally
 * from SQLite, so it works offline and updates instantly after each entry.
 */
export function computeInsights({ householdId: hh, currency, month, userName }: Ctx): Insight[] {
  const out: Insight[] = [];
  const money = (n: number) => formatMoney(n, currency);
  const t = today();
  const isCurrent = month === monthKey(t);
  const { from, to, days } = monthRange(month);
  const dayOfMonth = isCurrent ? parseDate(t).getDate() : days;
  const end = isCurrent ? t : to;
  const spent = totalBetween(hh, from, end);

  // 1. Pace vs same point last month
  const prev = addMonths(month, -1);
  const prevRange = monthRange(prev);
  const prevSameDay = `${prev}-${String(Math.min(dayOfMonth, prevRange.days)).padStart(2, "0")}`;
  const prevToDate = totalBetween(hh, prevRange.from, prevSameDay);
  if (prevToDate > 0 && spent > 0) {
    const change = ((spent - prevToDate) / prevToDate) * 100;
    const up = change > 0;
    out.push({
      id: "pace",
      icon: up ? "trending-up" : "trending-down",
      tone: Math.abs(change) < 5 ? "info" : up ? "warn" : "good",
      title: `${Math.abs(change).toFixed(0)}% ${up ? "more" : "less"} than last month`,
      body: `${money(spent)} by day ${dayOfMonth}, vs ${money(prevToDate)} at the same point last month.`,
    });
  }

  // 2. Month-end projection vs budget
  const budgets = listAll<Budget>("budgets", hh);
  const total = budgets.find((b) => b.categoryId === null && b.amount > 0);
  if (isCurrent && spent > 0 && dayOfMonth >= 3) {
    const projected = (spent / dayOfMonth) * days;
    if (total) {
      const over = projected - total.amount;
      out.push({
        id: "projection",
        icon: over > 0 ? "alert-circle" : "checkmark-circle",
        tone: over > 0 ? "bad" : "good",
        title: over > 0 ? `On track to overspend by ${money(over)}` : `On track to finish ${money(-over)} under budget`,
        body: `At today's pace the family will spend about ${money(projected)} this month (budget ${money(total.amount)}).`,
      });
    } else {
      out.push({
        id: "projection",
        icon: "speedometer",
        tone: "info",
        title: `Heading for ~${money(projected)} this month`,
        body: "Set a family budget in the Budgets tab to see whether that's on track.",
      });
    }
  }

  // 3. Category movers vs the 3 months before
  const cats = listAll<Category>("categories", hh);
  const catName = (id: string | null) => {
    const c = cats.find((x) => x.id === id);
    return c ? `${c.emoji} ${c.name}` : "Uncategorised";
  };
  const histFrom = monthRange(addMonths(month, -3)).from;
  const histTo = monthRange(addMonths(month, -1)).to;
  const hist = monthlyCategoryTotals(hh, histFrom, histTo);
  const monthsWithData = new Set(hist.map((h) => h.month)).size;
  if (monthsWithData >= 1) {
    const scale = days / dayOfMonth; // project current month to a full month
    const movers = categoryTotals(hh, from, end)
      .map((c) => {
        const avg = hist.filter((h) => h.categoryId === c.categoryId).reduce((a, h) => a + h.total, 0) / monthsWithData;
        return { ...c, avg, projected: c.total * scale };
      })
      .filter((c) => c.avg > 0 && c.projected > c.avg * 1.25 && c.projected - c.avg > 5)
      .sort((a, b) => b.projected - b.avg - (a.projected - a.avg))
      .slice(0, 2);
    for (const m of movers) {
      out.push({
        id: `mover-${m.categoryId}`,
        icon: "flame",
        tone: "warn",
        title: `${catName(m.categoryId)} is up ${(((m.projected - m.avg) / m.avg) * 100).toFixed(0)}%`,
        body: `${isCurrent ? "Heading for" : "Spent"} ${money(m.projected)} vs a usual ${money(m.avg)} a month.`,
      });
    }
  }

  // 4. Biggest single expense
  const exps = expensesBetween(hh, from, end);
  if (exps.length > 1) {
    const big = exps.reduce((a, b) => (b.amount > a.amount ? b : a));
    out.push({
      id: "biggest",
      icon: "receipt",
      tone: "info",
      title: `Biggest expense: ${big.description}`,
      body: `${money(big.amount)} · ${((big.amount / spent) * 100).toFixed(0)}% of this month's spending, paid by ${userName(big.paidBy)}.`,
    });
  }

  // 5. Who paid most
  const payers = paidByTotals(hh, from, end);
  if (payers.length > 1) {
    out.push({
      id: "payer",
      icon: "person",
      tone: "info",
      title: `${userName(payers[0].userId)} paid the most`,
      body: `${money(payers[0].total)} of ${money(spent)} (${((payers[0].total / spent) * 100).toFixed(0)}%) this month.`,
    });
  }

  // 6. No-spend days
  if (dayOfMonth >= 5) {
    const spendDays = dailyTotals(hh, from, end).length;
    const free = dayOfMonth - spendDays;
    if (free > 0) {
      out.push({
        id: "nospend",
        icon: "leaf",
        tone: "good",
        title: `${free} no-spend day${free === 1 ? "" : "s"}`,
        body: `Out of ${dayOfMonth} days${isCurrent ? " so far" : ""} this month.`,
      });
    }
  }

  // 7. Busiest weekday (last 90 days)
  const recent = dailyTotals(hh, addPeriod(end, "day", -90), end);
  if (recent.length >= 10) {
    const byDay = new Array(7).fill(0);
    for (const d of recent) byDay[parseDate(d.date).getDay()] += d.total;
    const top = byDay.indexOf(Math.max(...byDay));
    const share = (byDay[top] / byDay.reduce((a, b) => a + b, 0)) * 100;
    if (share > 20) {
      out.push({
        id: "weekday",
        icon: "calendar",
        tone: "info",
        title: `${WEEKDAYS[top]}s are the big spending day`,
        body: `${share.toFixed(0)}% of the last 90 days' spending happened on ${WEEKDAYS[top]}s.`,
      });
    }
  }

  // 8. Fixed commitments (recurring) share of a typical month
  const rec = listAll<Recurring>("recurring", hh).filter((r) => r.active);
  if (rec.length > 0) {
    const perMonth = rec.reduce((a, r) => {
      const factor = r.frequency === "week" ? 52 / 12 : r.frequency === "year" ? 1 / 12 : 1;
      return a + (r.amount * factor) / r.intervalN;
    }, 0);
    const typical = totalBetween(hh, monthRange(addMonths(month, -3)).from, monthRange(addMonths(month, -1)).to) / 3;
    out.push({
      id: "fixed",
      icon: "repeat",
      tone: "info",
      title: `${money(perMonth)}/month in fixed bills`,
      body:
        typical > 0
          ? `About ${((perMonth / typical) * 100).toFixed(0)}% of a typical month's spending is recurring.`
          : `${rec.length} recurring expense${rec.length === 1 ? "" : "s"} set up.`,
    });
  }

  return out;
}
