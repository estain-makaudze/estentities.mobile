import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable } from "react-native";
import { fonts, radius, useTheme } from "../theme";
import { friendlyDate, parseDate, toDateStr } from "../utils/dates";
import { T } from "./ui";

export function DateField({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.card, borderRadius: radius.md,
          paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: c.line,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={c.sub} />
        <T variant="bodyStrong" style={{ flex: 1, fontFamily: fonts.medium }}>
          {friendlyDate(value)} · {parseDate(value).toLocaleDateString()}
        </T>
      </Pressable>
      {open && (
        <DateTimePicker
          value={parseDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date(2100, 0, 1)}
          onChange={(event, d) => {
            if (Platform.OS !== "ios") setOpen(false);
            if (event.type === "set" && d) onChange(toDateStr(d));
          }}
        />
      )}
    </>
  );
}
