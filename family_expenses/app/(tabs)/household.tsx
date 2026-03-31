import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Clipboard,
} from "react-native";
import { useHousehold } from "../../context/HouseholdContext";
import { useAuth } from "../../context/AuthContext";
import { User } from "../../types";

export default function HouseholdScreen() {
  const { household, members, leaveHousehold, refreshHousehold } = useHousehold();
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!household?.invite_code) return;
    Clipboard.setString(household.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    Alert.alert(
      "Leave Household",
      "Are you sure you want to leave this household? You will lose access to all shared expenses.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const result = await leaveHousehold();
            if (result.error) Alert.alert("Error", result.error);
          },
        },
      ]
    );
  };

  const renderMember = ({ item, index }: { item: User; index: number }) => {
    const isMe = item.id === profile?.id;
    return (
      <View style={styles.memberCard}>
        <View style={[styles.avatar, { backgroundColor: item.color }]}>
          <Text style={styles.avatarText}>
            {(item.name || "?")[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name || `Member ${index + 1}`}</Text>
          {isMe && <Text style={styles.youBadge}>You</Text>}
        </View>
      </View>
    );
  };

  if (!household) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Household card */}
        <View style={styles.householdCard}>
          <Text style={styles.householdLabel}>Your Household</Text>
          <Text style={styles.householdName}>{household.name}</Text>
        </View>

        {/* Invite code section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📨 Invite Code</Text>
          <Text style={styles.sectionSubtitle}>
            Share this code with family members so they can join your household.
          </Text>
          <View style={styles.codeRow}>
            <Text style={styles.inviteCode}>{household.invite_code}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode}>
              <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Members section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            👥 Members ({members.length})
          </Text>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            renderItem={renderMember}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No members found.</Text>
            }
          />
          <TouchableOpacity style={styles.refreshBtn} onPress={refreshHousehold}>
            <Text style={styles.refreshBtnText}>↻ Refresh Members</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={styles.dangerTitle}>⚠️ Danger Zone</Text>
          <Text style={styles.dangerSubtitle}>
            Leaving the household will remove your access to all shared expenses and settlements.
          </Text>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave Household</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 16, paddingBottom: 48 },

  householdCard: {
    backgroundColor: "#4A90D9",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  householdLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 6 },
  householdName: { color: "#fff", fontSize: 26, fontWeight: "800" },

  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#1C1C1E", marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: "#6C6C70", lineHeight: 18, marginBottom: 14 },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  inviteCode: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: 4,
  },
  copyBtn: {
    backgroundColor: "#4A90D9",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  copyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
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
  memberInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 16, fontWeight: "600", color: "#1C1C1E" },
  youBadge: {
    backgroundColor: "#E0EEFF",
    color: "#4A90D9",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  emptyText: { fontSize: 14, color: "#8E8E93", textAlign: "center", paddingVertical: 12 },
  refreshBtn: {
    marginTop: 12,
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  refreshBtnText: { color: "#4A90D9", fontSize: 14, fontWeight: "600" },

  dangerSection: { borderWidth: 1, borderColor: "#FFCDD2" },
  dangerTitle: { fontSize: 15, fontWeight: "700", color: "#E74C3C", marginBottom: 6 },
  dangerSubtitle: { fontSize: 13, color: "#6C6C70", lineHeight: 18, marginBottom: 14 },
  leaveBtn: {
    backgroundColor: "#FFF0F0",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  leaveBtnText: { color: "#E74C3C", fontSize: 15, fontWeight: "700" },
});
