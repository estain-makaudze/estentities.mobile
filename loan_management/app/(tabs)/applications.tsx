import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LocalLoanApplication, useApplications } from "../../store/applicationStore";
import { useSettings } from "../../store/settingsStore";
import { formatMoney } from "../../utils/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Application card ──────────────────────────────────────────────────────────

function AppCard({
  app,
  currency,
  onContinue,
  onDelete,
}: {
  app: LocalLoanApplication;
  currency: string;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const isDraft = app.status === "draft";

  return (
    <TouchableOpacity
      style={[styles.card, !isDraft && styles.cardSubmitted]}
      onPress={onContinue}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardApplicant} numberOfLines={1}>
            {app.applicantName || "Unnamed Applicant"}
          </Text>
          <Text style={styles.cardBusiness} numberOfLines={1}>
            {app.businessName || "Business not set"}
          </Text>
        </View>
        <Text style={styles.cardAmount}>
          {formatMoney(app.loanAmountRequested, currency)}
        </Text>
      </View>

      {/* Meta */}
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaItem}>
          <Ionicons name="business-outline" size={12} color="#6B7280" />
          <Text style={styles.cardMetaText}>{app.businessType}</Text>
        </View>
        <View style={styles.cardMetaItem}>
          <Ionicons name="time-outline" size={12} color="#6B7280" />
          <Text style={styles.cardMetaText}>{timeAgo(app.updatedAt)}</Text>
        </View>
        <View style={styles.cardMetaItem}>
          <Ionicons name="calendar-outline" size={12} color="#6B7280" />
          <Text style={styles.cardMetaText}>{app.repaymentPeriodMonths}mo @ {app.interestRate}%</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statPillLabel}>Products</Text>
          <Text style={styles.statPillValue}>{app.productLines.length}</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statPillLabel}>Expenses</Text>
          <Text style={styles.statPillValue}>{app.expenseLines.length}</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statPillLabel}>Orders</Text>
          <Text style={styles.statPillValue}>{app.orderingLines.length}</Text>
        </View>
      </View>

      {/* Submission error */}
      {app.submitError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#B91C1C" />
          <Text style={styles.errorText} numberOfLines={2}>{app.submitError}</Text>
        </View>
      ) : null}

      {/* Footer actions */}
      <View style={styles.cardFooter}>
        {isDraft ? (
          <>
            <View style={styles.draftBadge}>
              <View style={styles.draftDot} />
              <Text style={styles.draftText}>Draft</Text>
            </View>
            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.continueBtn} onPress={onContinue}>
                <Ionicons name="create-outline" size={14} color="#FFFFFF" />
                <Text style={styles.continueBtnText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.submittedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#166534" />
              <Text style={styles.submittedText}>
                {app.odooRef ?? "Submitted"}
              </Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ApplicationsScreen() {
  const { settings } = useSettings();
  const { applications, createApplication, saveApplication, deleteApplication } = useApplications();
  const currency = settings.defaultCurrency || "UGX";

  const drafts = useMemo(
    () => applications.filter((a) => a.status === "draft"),
    [applications]
  );
  const submitted = useMemo(
    () => applications.filter((a) => a.status === "submitted"),
    [applications]
  );

  const handleNew = useCallback(async () => {
    const app = createApplication();
    await saveApplication(app);
    router.push({ pathname: "/new-application", params: { appId: app.id } });
  }, [createApplication, saveApplication]);

  const handleContinue = useCallback((app: LocalLoanApplication) => {
    router.push({ pathname: "/new-application", params: { appId: app.id } });
  }, []);

  const confirmDelete = useCallback(
    (app: LocalLoanApplication) => {
      Alert.alert(
        "Delete Application",
        `Delete the application for ${app.applicantName || "this applicant"}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteApplication(app.id) },
        ]
      );
    },
    [deleteApplication]
  );

  const allApps = useMemo(
    () => [...drafts, ...submitted],
    [drafts, submitted]
  );

  type ListItem =
    | { type: "header"; label: string; count: number }
    | { type: "app"; app: LocalLoanApplication }
    | { type: "empty"; label: string };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    items.push({ type: "header", label: "Drafts", count: drafts.length });
    if (drafts.length === 0) {
      items.push({ type: "empty", label: "No draft applications" });
    } else {
      drafts.forEach((a) => items.push({ type: "app", app: a }));
    }
    if (submitted.length > 0) {
      items.push({ type: "header", label: "Submitted to Odoo", count: submitted.length });
      submitted.forEach((a) => items.push({ type: "app", app: a }));
    }
    return items;
  }, [drafts, submitted]);

  return (
    <View style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      <FlatList
        data={listData}
        keyExtractor={(item, idx) =>
          item.type === "app" ? item.app.id : `${item.type}-${idx}`
        }
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.pageTitle}>Applications</Text>
              <Text style={styles.pageSubtitle}>
                {allApps.length} total · {drafts.length} draft
              </Text>
            </View>
            <TouchableOpacity style={styles.newBtn} onPress={handleNew}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.newBtnText}>New</Text>
            </TouchableOpacity>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{item.label}</Text>
                <View style={[styles.sectionBadge, item.label === "Submitted to Odoo" && { backgroundColor: "#166534" }]}>
                  <Text style={styles.sectionBadgeText}>{item.count}</Text>
                </View>
              </View>
            );
          }
          if (item.type === "empty") {
            return (
              <View style={styles.emptyCard}>
                <Ionicons name="document-outline" size={28} color="#9CA3AF" />
                <Text style={styles.emptyText}>{item.label}</Text>
                <TouchableOpacity style={styles.startBtn} onPress={handleNew}>
                  <Text style={styles.startBtnText}>Start first application →</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <AppCard
              app={item.app}
              currency={currency}
              onContinue={() => handleContinue(item.app)}
              onDelete={() => confirmDelete(item.app)}
            />
          );
        }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },

  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
  pageSubtitle: { marginTop: 2, fontSize: 13, color: "#6B7280" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#374151" },
  sectionBadge: {
    backgroundColor: "#2563EB",
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  sectionBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: { color: "#6B7280", fontSize: 14 },
  startBtn: { marginTop: 4 },
  startBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 14 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  cardSubmitted: { borderColor: "#BBF7D0", backgroundColor: "#F9FFFE" },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardApplicant: { fontSize: 17, fontWeight: "700", color: "#111827" },
  cardBusiness: { marginTop: 2, fontSize: 13, color: "#6B7280" },
  cardAmount: { fontSize: 17, fontWeight: "800", color: "#2563EB" },

  cardMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  cardMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 12, color: "#6B7280" },

  statsRow: { flexDirection: "row", gap: 8 },
  statPill: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  statPillLabel: { fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.3 },
  statPillValue: { fontSize: 16, fontWeight: "700", color: "#374151", marginTop: 2 },

  errorRow: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 8,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 12, color: "#B91C1C" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  draftBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  draftDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" },
  draftText: { fontSize: 13, color: "#92400E", fontWeight: "600" },
  footerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  continueBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  submittedBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  submittedText: { fontSize: 13, color: "#166534", fontWeight: "700" },
});


