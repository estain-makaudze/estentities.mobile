import React, { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { fonts, useTheme } from "../theme";
import { formatMoney } from "../utils/format";
import { T } from "./ui";

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
  return step * p;
}

function shortNum(v: number): string {
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 18, flexWrap: "wrap" }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: i.color }} />
          <T variant="caption">{i.label}</T>
        </View>
      ))}
    </View>
  );
}

/**
 * Paired rounded bars per period (blue = spent, grey = comparison such as
 * budget), with the selected period's label in a dark pill — as in the mock.
 */
export function BarChart({
  data, selected, onSelect, height = 200,
}: {
  data: { key: string; label: string; a: number; b?: number | null }[];
  selected?: string;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const { c } = useTheme();
  const [width, onLayout] = useWidth();
  const axisW = 34;
  const labelH = 34;
  const plotH = height - labelH;
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.a, d.b ?? 0)), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = data.length ? (width - axisW) / data.length : 0;
  const barW = Math.max(6, Math.min(12, slot / 5));
  const hasB = data.some((d) => d.b != null && d.b > 0);

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map((t) => {
            const y = plotH - (t / max) * (plotH - 10);
            return (
              <G key={t}>
                <Line x1={axisW} x2={width} y1={y} y2={y} stroke={c.line} strokeDasharray="4 6" />
                <SvgText x={0} y={y + 4} fontSize={11} fill={c.sub} fontFamily={fonts.medium}>
                  {shortNum(t)}
                </SvgText>
              </G>
            );
          })}
          {data.map((d, i) => {
            const cx = axisW + slot * i + slot / 2;
            const hA = (d.a / max) * (plotH - 10);
            const hB = ((d.b ?? 0) / max) * (plotH - 10);
            const on = d.key === selected;
            const xA = hasB ? cx - barW - 2 : cx - barW / 2;
            return (
              <G key={d.key}>
                {hA > 0 && (
                  <Rect x={xA} y={plotH - hA} width={barW} height={hA} rx={barW / 2}
                        fill={c.primary} opacity={!selected || on ? 1 : 0.55} />
                )}
                {hasB && hB > 0 && (
                  <Rect x={cx + 2} y={plotH - hB} width={barW} height={hB} rx={barW / 2} fill={c.muted} />
                )}
                {on && <Rect x={cx - 22} y={plotH + 6} width={44} height={24} rx={12} fill={c.dark} />}
                <SvgText
                  x={cx} y={plotH + 22} fontSize={12} textAnchor="middle"
                  fill={on ? c.onDark : c.sub} fontFamily={on ? fonts.bold : fonts.medium}
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
      {onSelect && width > 0 && (
        <View style={{ position: "absolute", left: axisW, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
          {data.map((d) => (
            <Pressable key={d.key} style={{ flex: 1 }} onPress={() => onSelect(d.key)} />
          ))}
        </View>
      )}
    </View>
  );
}

function arc(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
  const e = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/** Donut with rounded segment caps and a centred total. */
export function DonutChart({
  segments, size = 200, stroke = 26, centerLabel, centerValue,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { c } = useTheme();
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const gap = segments.length > 1 ? 0.04 : 0;
  let angle = -Math.PI / 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={cx} cy={cx} r={r} stroke={c.cardAlt} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          segments.map((s, i) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const start = angle + gap / 2;
            const end = angle + sweep - gap / 2;
            angle += sweep;
            if (sweep >= Math.PI * 2 - 0.001) {
              return <Circle key={i} cx={cx} cy={cx} r={r} stroke={s.color} strokeWidth={stroke} fill="none" />;
            }
            if (end <= start) return null;
            return (
              <Path key={i} d={arc(cx, cx, r, start, end)} stroke={s.color} strokeWidth={stroke}
                    strokeLinecap="round" fill="none" />
            );
          })}
      </Svg>
      {centerValue && <T variant="h2" style={{ fontFamily: fonts.extrabold }}>{centerValue}</T>}
      {centerLabel && <T variant="caption">{centerLabel}</T>}
    </View>
  );
}

/**
 * Cumulative spend through the month (area line) with an optional dashed
 * budget line and a faint "last month" line for comparison.
 */
export function CumulativeChart({
  days, values, compare, budget, currency, height = 170,
}: {
  days: number;
  values: number[]; // cumulative per day (only up to today)
  compare?: number[]; // cumulative last month
  budget?: number | null;
  currency: string;
  height?: number;
}) {
  const { c } = useTheme();
  const [width, onLayout] = useWidth();
  const padT = 14;
  const padB = 22;
  const max = niceMax(Math.max(budget ?? 0, ...values, ...(compare ?? []), 1));
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * (width - 4)) + 2;
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.primary} stopOpacity={0.25} />
              <Stop offset="1" stopColor={c.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {compare && compare.length > 1 && (
            <Path d={line(compare)} stroke={c.muted} strokeWidth={2} fill="none" />
          )}
          {budget != null && budget > 0 && (
            <G>
              <Line x1={0} x2={width} y1={y(budget)} y2={y(budget)} stroke={c.danger} strokeDasharray="6 6" strokeWidth={1.5} />
              <SvgText x={width - 2} y={y(budget) - 6} fontSize={11} textAnchor="end" fill={c.danger} fontFamily={fonts.semibold}>
                Budget {formatMoney(budget, currency, { compact: true })}
              </SvgText>
            </G>
          )}
          {values.length > 1 && (
            <>
              <Path d={`${line(values)} L ${x(values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill="url(#area)" />
              <Path d={line(values)} stroke={c.primary} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={5} fill={c.card} stroke={c.primary} strokeWidth={3} />
            </>
          )}
          {[1, Math.ceil(days / 2), days].map((d) => (
            <SvgText key={d} x={Math.min(width - 12, Math.max(4, x(d - 1)))} y={height - 4} fontSize={11}
                     textAnchor="middle" fill={c.sub} fontFamily={fonts.medium}>
              {d}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
