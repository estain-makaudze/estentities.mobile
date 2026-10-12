import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { getMeta, setMeta } from "../db/database";

/**
 * Design tokens — clean fintech look: white cards on a soft grey canvas,
 * royal-blue accent, cool-grey secondary bars, dark pill for primary actions.
 */

const light = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  cardAlt: "#F1F2F6",
  ink: "#16181D",
  sub: "#8A8F9C",
  line: "#ECEEF3",
  primary: "#2B3BE0",
  primarySoft: "#E9EBFF",
  muted: "#C9CED8",
  dark: "#1B1D22",
  onDark: "#FFFFFF",
  success: "#2BB673",
  successSoft: "#E4F6EC",
  warning: "#F2994A",
  warningSoft: "#FDEFE2",
  danger: "#E5484D",
  dangerSoft: "#FDE8E8",
  shadow: "#1B1D22",
};

// Soft dark: slate greys instead of near-black, so it stays easy on the eyes
// without feeling like a black hole.
const dark: typeof light = {
  bg: "#1E222B",
  card: "#282D38",
  cardAlt: "#323845",
  ink: "#F2F4F8",
  sub: "#A9B0BE",
  line: "#3A4050",
  primary: "#6E79FF",
  primarySoft: "#353B6B",
  muted: "#586071",
  dark: "#F2F4F8",
  onDark: "#1E222B",
  success: "#45D08F",
  successSoft: "#244034",
  warning: "#F7B26A",
  warningSoft: "#463727",
  danger: "#F27479",
  dangerSoft: "#4A2C30",
  shadow: "#0B0D12",
};

export type Colors = typeof light;

export const fonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
};

export const radius = { sm: 10, md: 16, lg: 20, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Category / member accent colours (tile background uses a soft tint of these). */
export const PALETTE = ["#2B3BE0", "#F2994A", "#2BB673", "#9B51E0", "#E5484D", "#12B5B0", "#F2C94C", "#3E7BFA", "#8A8F9C"];

// ── Appearance preference (Light by default; stored on the phone) ─────────
export type ThemePref = "light" | "dark" | "system";
let pref: ThemePref = (getMeta("theme") as ThemePref | null) ?? "light";
const prefListeners = new Set<() => void>();

export function setThemePreference(p: ThemePref) {
  pref = p;
  setMeta("theme", p);
  prefListeners.forEach((l) => l());
}

export function useThemePreference(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => {
        prefListeners.delete(l);
      };
    },
    () => pref,
    () => pref
  );
}

export function useTheme() {
  const system = useColorScheme();
  const p = useThemePreference();
  const scheme = (p === "system" ? system : p) === "dark" ? "dark" : "light";
  return { c: scheme === "dark" ? dark : light, scheme, fonts, radius, space };
}

/** `const useStyles = makeStyles((c) => ({...}))` → theme-aware StyleSheet hook. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Colors) => T) {
  return function useStyles() {
    const { c } = useTheme();
    return useMemo(() => StyleSheet.create(factory(c)), [c]);
  };
}

/** Hex colour with alpha, e.g. tint("#2B3BE0", 0.12) */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `#${h.slice(0, 6)}${a}`;
}

export function cardShadow(c: Colors) {
  return {
    shadowColor: c.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  };
}
