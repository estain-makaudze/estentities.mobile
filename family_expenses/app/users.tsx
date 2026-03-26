import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../context/AppContext";
import { User } from "../types";
import { USER_COLORS } from "../constants/colors";

export default function UsersScreen() {
  const { state, addUser, deleteUser } = useApp();
  const { users } = state;

  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(USER_COLORS[0]);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Please enter a name.");
      return;
    }
    if (users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert("Validation", "A user with that name already exists.");
      return;
    }
    addUser({ name: trimmed, color: selectedColor });
    setName("");
    // Rotate colour suggestion to next in palette.
    const nextIndex = (USER_COLORS.indexOf(selectedColor) + 1) % USER_COLORS.length;
    setSelectedColor(USER_COLORS[nextIndex]);
  };

  const handleDelete = (user: User) => {
    Alert.alert(
      "Remove User",
      `Remove "${user.name}"? Their past expenses and settlements will still be stored but will appear as "Unknown" in the app.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteUser(user.id),
        },
      ]
    );
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={[styles.avatar, { backgroundColor: item.color }]}>
        <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
      </View>
      <Text style={styles.userName}>{item.name}</Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item)}
      >
        <Text style={styles.deleteBtnText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* Add user form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add Person</Text>
          <TextInput
            style={styles.input}
            placeholder="Name (e.g. Alex, Sam…)"
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />

          <Text style={styles.colorLabel}>Pick a colour</Text>
          <View style={styles.colorRow}>
            {USER_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorSwatchSelected,
                ]}
                onPress={() => setSelectedColor(color)}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <Text style={styles.addBtnText}>Add Person</Text>
          </TouchableOpacity>
        </View>

        {/* Users list */}
        {users.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No people added yet</Text>
            <Text style={styles.emptySubtext}>
              Add the people who share expenses together.
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            renderItem={renderUser}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },

  formCard: {
    backgroundColor: "#fff",
    margin: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: { fontSize: 17, fontWeight: "700", color: "#1C1C1E", marginBottom: 12 },
  input: {
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    marginBottom: 12,
  },
  colorLabel: { fontSize: 13, color: "#6C6C70", marginBottom: 8 },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 14 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#1C1C1E",
  },
  addBtn: {
    backgroundColor: "#4A90D9",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  userName: { flex: 1, fontSize: 17, fontWeight: "600", color: "#1C1C1E" },
  deleteBtn: {
    backgroundColor: "#FFF0F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteBtnText: { color: "#E74C3C", fontSize: 13, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: "700", color: "#1C1C1E", marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: "#6C6C70", textAlign: "center" },
});
