import React from "react";
import { TextInput, View } from "react-native";
import type { User } from "../types";
import { fonts, radius, useTheme } from "../theme";
import type { SplitMode } from "../utils/splits";
import { Avatar, Segmented, T } from "./ui";

/** Split mode picker + per-member percentage inputs (shared by expense, recurring and category forms). */
export function SplitEditor({
  users, mode, onModeChange, percentages, onPercentagesChange,
}: {
  users: User[];
  mode: SplitMode;
  onModeChange: (m: SplitMode) => void;
  percentages: Record<string, string>;
  onPercentagesChange: (p: Record<string, string>) => void;
}) {
  const { c } = useTheme();
  const total = users.reduce((a, u) => a + (parseFloat(percentages[u.id] ?? "0") || 0), 0);
  return (
    <View style={{ gap: 10 }}>
      <Segmented
        value={mode}
        onChange={onModeChange}
        options={[
          { value: "equal", label: "Split equally" },
          { value: "custom", label: "Custom %" },
          { value: "none", label: "Not shared" },
        ]}
      />
      {mode === "none" && (
        <T variant="caption">The payer covers this fully — it doesn&apos;t change anyone&apos;s balance.</T>
      )}
      {mode === "equal" && users.length > 0 && (
        <T variant="caption">Each of the {users.length} members pays {(100 / users.length).toFixed(1)}%.</T>
      )}
      {mode === "custom" && (
        <View style={{ backgroundColor: c.card, borderRadius: radius.md, padding: 12, gap: 10 }}>
          {users.map((u) => (
            <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar name={u.name} color={u.color} size={30} />
              <T variant="bodyStrong" style={{ flex: 1 }}>{u.name}</T>
              <TextInput
                value={percentages[u.id] ?? ""}
                onChangeText={(v) => onPercentagesChange({ ...percentages, [u.id]: v })}
                keyboardType="decimal-pad"
                style={{
                  width: 70, textAlign: "right", backgroundColor: c.cardAlt, borderRadius: radius.sm,
                  paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.semibold, fontSize: 15, color: c.ink,
                }}
              />
              <T muted>%</T>
            </View>
          ))}
          <T variant="caption" color={Math.abs(total - 100) > 0.1 ? c.danger : c.success} style={{ textAlign: "right" }}>
            Total {total.toFixed(1)}%
          </T>
        </View>
      )}
    </View>
  );
}
