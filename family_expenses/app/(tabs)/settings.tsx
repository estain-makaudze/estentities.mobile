import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { SplitEditor } from "../../components/SplitEditor";
import { Button, Card, Field, FieldLabel, Header, IconTile, Row, Screen, T } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useHousehold } from "../../context/HouseholdContext";
import { PALETTE, radius, useTheme } from "../../theme";
import type { Category } from "../../types";
import { buildSplits, determineSplitMode, extractCustomPercentages, type SplitMode } from "../../utils/splits";

const EMOJI_OPTIONS = ["🛒", "💡", "🏠", "🚗", "🍽️", "💊", "🎬", "📦", "✈️", "🎓", "👗", "🐾", "🎮", "🏋️", "🧹", "🎁", "🍕", "☕", "🏥", "💰", "📱", "⛽", "👶", "⛪"];

/** Categories (synced to every family member) with optional default split. */
export default function CategoriesScreen() {
  const { c } = useTheme();
  const { categories, saveCategory, deleteCategory } = useApp();
  const { members } = useHousehold();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [color, setColor] = useState(PALETTE[0]);
  const [mode, setMode] = useState<SplitMode>("none");
  const [pcts, setPcts] = useState<Record<string, string>>({});

  const open = (cat: Category | "new") => {
    setEditing(cat);
    const src = cat === "new" ? null : cat;
    setName(src?.name ?? "");
    setEmoji(src?.emoji ?? "📦");
    setColor(src?.color ?? PALETTE[categories.length % PALETTE.length]);
    setMode(determineSplitMode(src?.defaultSplits, members));
    setPcts(extractCustomPercentages(src?.defaultSplits, members));
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return Alert.alert("Category", "Enter a name.");
    const current = editing === "new" ? null : editing;
    if (categories.some((x) => x.name.toLowerCase() === n.toLowerCase() && x.id !== current?.id)) {
      return Alert.alert("Category", "A category with that name already exists.");
    }
    const splits = buildSplits(mode, members, pcts);
    if (typeof splits === "string") return Alert.alert("Default split", splits);
    saveCategory({ ...(current ?? {}), name: n, emoji, color, defaultSplits: splits });
    setEditing(null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen bottomInset={110}>
        <Header
          title="Categories"
          right={
            <Pressable hitSlop={10} onPress={() => open("new")}>
              <Ionicons name="add-circle" size={28} color={c.primary} />
            </Pressable>
          }
        />
        <T variant="caption" style={{ marginBottom: 12 }}>
          Shared with your whole family. A default split is applied automatically when you pick the category.
        </T>

        {editing && (
          <Card style={{ marginBottom: 16 }}>
            <T variant="h3">{editing === "new" ? "New category" : `Edit ${editing.name}`}</T>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. School fees" />
            <FieldLabel>Icon</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {EMOJI_OPTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={{
                    width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    backgroundColor: emoji === e ? c.primarySoft : c.cardAlt, borderWidth: emoji === e ? 2 : 0, borderColor: c.primary,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <FieldLabel>Colour</FieldLabel>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {PALETTE.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setColor(p)}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p, borderWidth: color === p ? 3 : 0, borderColor: c.ink }}
                />
              ))}
            </View>
            <FieldLabel>Default split</FieldLabel>
            <SplitEditor users={members} mode={mode} onModeChange={setMode} percentages={pcts} onPercentagesChange={setPcts} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
              <Button title="Save" onPress={submit} style={{ flex: 2 }} />
            </View>
          </Card>
        )}

        <Card style={{ paddingVertical: 4 }}>
          {categories.map((cat, i) => (
            <Row key={cat.id} style={{ paddingVertical: 10 }} onPress={() => open(cat)}>
              <IconTile emoji={cat.emoji} color={cat.color ?? PALETTE[i % PALETTE.length]} size={40} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{cat.name}</T>
                <T variant="caption">
                  {cat.defaultSplits?.length ? `Default: split ${cat.defaultSplits.length} ways` : "No default split"}
                </T>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() =>
                  Alert.alert("Delete category?", `Existing expenses in "${cat.name}" become uncategorised.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteCategory(cat.id) },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={18} color={c.sub} />
              </Pressable>
            </Row>
          ))}
        </Card>
        <View style={{ height: 8, borderRadius: radius.sm }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
