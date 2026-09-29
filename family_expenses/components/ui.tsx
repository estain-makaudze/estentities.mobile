import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator, Pressable, ScrollView, Text, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps,
  type TextStyle, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, fonts, makeStyles, radius, tint, useTheme } from "../theme";
import { formatMoney } from "../utils/format";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Typography ──────────────────────────────────────────────────────────────

type Variant = "display" | "h1" | "h2" | "h3" | "body" | "bodyStrong" | "caption" | "label";

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.extrabold, fontSize: 34, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.semibold, fontSize: 15 },
  body: { fontFamily: fonts.regular, fontSize: 15 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5 },
  label: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
};

export function T({
  variant = "body", muted, color, style, ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[variantStyle[variant], { color: color ?? (muted || variant === "caption" ? c.sub : c.ink) }, style]}
    />
  );
}

export function Money({
  amount, currency, variant = "bodyStrong", sign, color, compact, style,
}: {
  amount: number; currency: string; variant?: Variant; sign?: boolean; color?: string; compact?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <T variant={variant} color={color} style={[{ fontVariant: ["tabular-nums"] }, style]}>
      {formatMoney(amount, currency, { sign, compact })}
    </T>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function Screen({
  children, scroll = true, padded = true, bottomInset = 24, style, ...rest
}: ScrollViewProps & { scroll?: boolean; padded?: boolean; bottomInset?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const content: ViewStyle = { paddingHorizontal: padded ? 20 : 0, paddingBottom: bottomInset + insets.bottom };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, content, style]}>{children}</View>;
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.bg }, style]}
      contentContainerStyle={content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** "← Title" header row like the Statistics screen in the mock. */
export function Header({ title, right, back = true }: { title: string; right?: React.ReactNode; back?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 8, paddingBottom: 12, gap: 12 }}>
      {back && (
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Ionicons name="arrow-back" size={24} color={c.ink} />
        </Pressable>
      )}
      <T variant="h2" style={{ flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, padding: padded ? 16 : 0 }, cardShadow(c), style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 24, marginBottom: 12 }}>
      <T variant="h2" style={{ flex: 1 }}>{title}</T>
      {action && (
        <Pressable hitSlop={10} onPress={onAction} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <T variant="caption" color={c.ink} style={{ fontFamily: fonts.semibold }}>{action}</T>
          <Ionicons name="arrow-forward" size={16} color={c.ink} />
        </Pressable>
      )}
    </View>
  );
}

// ── Atoms ───────────────────────────────────────────────────────────────────

/** Rounded square with a soft tint (the Grocery / Netflix tiles in the mock). */
export function IconTile({
  emoji, icon, color, size = 46,
}: { emoji?: string; icon?: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size * 0.3, backgroundColor: tint(color, 0.13),
        alignItems: "center", justifyContent: "center",
      }}
    >
      {emoji ? (
        <Text style={{ fontSize: size * 0.46 }}>{emoji}</Text>
      ) : (
        <Ionicons name={icon ?? "ellipse"} size={size * 0.46} color={color} />
      )}
    </View>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: fonts.bold, fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ alignItems: "center", gap: 8, flex: 1, opacity: pressed ? 0.6 : 1 })}>
      <View style={[{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }, cardShadow(c)]}>
        <Ionicons name={icon} size={24} color={c.ink} />
      </View>
      <T variant="caption" color={c.ink}>{label}</T>
    </Pressable>
  );
}

export function Button({
  title, onPress, variant = "primary", icon, loading, disabled, style,
}: {
  title: string; onPress: () => void; variant?: "primary" | "dark" | "ghost" | "danger";
  icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = { primary: c.primary, dark: c.dark, ghost: "transparent", danger: c.dangerSoft }[variant];
  const fg = { primary: "#fff", dark: c.onDark, ghost: c.sub, danger: c.danger }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg, borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 20,
          alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 15.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label, active, onPress, color,
}: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const { c } = useTheme();
  const on = color ?? c.dark;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: active ? on : c.card, borderWidth: 1, borderColor: active ? on : c.line,
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: active ? (color ? "#fff" : c.onDark) : c.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.cardAlt, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              { flex: 1, paddingVertical: 10, borderRadius: radius.sm + 2, alignItems: "center" },
              on && [{ backgroundColor: c.card }, cardShadow(c)],
            ]}
          >
            <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 13.5, color: on ? c.ink : c.sub }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ ratio, color, height = 8 }: { ratio: number; color?: string; height?: number }) {
  const { c } = useTheme();
  const col = color ?? (ratio >= 1 ? c.danger : ratio >= 0.8 ? c.warning : c.success);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.cardAlt, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, height, borderRadius: height, backgroundColor: col }} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: {
  icon: IconName; title: string; body?: string; action?: string; onAction?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
        <Ionicons name={icon} size={28} color={c.primary} />
      </View>
      <T variant="h3" style={{ textAlign: "center" }}>{title}</T>
      {body && <T variant="caption" style={{ textAlign: "center" }}>{body}</T>}
      {action && <Button title={action} onPress={onAction ?? (() => {})} style={{ marginTop: 8 }} variant="dark" />}
    </View>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

const useFieldStyles = makeStyles((c) => ({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: c.sub, marginBottom: 8, marginTop: 18 },
  input: {
    backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: fonts.medium, fontSize: 16, color: c.ink, borderWidth: 1, borderColor: c.line,
  },
}));

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const s = useFieldStyles();
  const { c } = useTheme();
  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput placeholderTextColor={c.sub} {...props} style={[s.input, style]} />
    </View>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const s = useFieldStyles();
  return <Text style={s.label}>{children}</Text>;
}

export function Row({ children, style, ...rest }: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed && rest.onPress ? 0.6 : 1 }, style]}>
      {children}
    </Pressable>
  );
}
