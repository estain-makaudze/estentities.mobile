import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, Switch, View } from "react-native";
import { Avatar, Button, Card, Chip, Header, Money, Row, Screen, SectionHeader, Segmented, T } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useDataVersion } from "../../db/events";
import { allExpenses, allSettlements } from "../../db/queries";
import { useSyncStatus } from "../../hooks/useSync";
import { api } from "../../services/api";
import { syncNow } from "../../services/syncEngine";
import { radius, setThemePreference, useTheme, useThemePreference, type ThemePref } from "../../theme";
import { computeNetBalances } from "../../utils/balance";
import { CURRENCIES } from "../../utils/format";
import { REMINDER_TIMES, getReminderSettings, scheduleDailyReminders, setReminderSettings } from "../../utils/notify";

type Device = { id: string; name: string; last_seen: string; current: boolean };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Family tab: invite code, members & balances, currency, sync, devices, account. */
export default function FamilyScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { user, userId, logout } = useAuth();
  const {
    household, households, members, memberships, isOwner, currency, switchHousehold,
    leaveHousehold, rotateInviteCode, updateHousehold, removeMember,
  } = useHousehold();
  const sync = useSyncStatus();
  const version = useDataVersion();
  const hh = household?.id ?? "";
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [showCurrency, setShowCurrency] = useState(false);
  const themePref = useThemePreference();
  const [reminder, setReminder] = useState(getReminderSettings);
  const updateReminder = (patch: { enabled?: boolean; time?: string }) => {
    setReminderSettings(patch);
    setReminder(getReminderSettings());
    if (hh && userId) void scheduleDailyReminders(hh, userId);
  };

  const balances = useMemo(() => {
    void version;
    return computeNetBalances(allExpenses(hh), allSettlements(hh), members.map((m) => m.id));
  }, [hh, members, version]);

  const loadDevices = useCallback(() => {
    api<{ devices: Device[] }>("GET", "/me").then((r) => setDevices(r.devices)).catch(() => setDevices(null));
  }, []);
  useEffect(() => {
    if (sync.isOnline) loadDevices();
  }, [sync.isOnline, loadDevices]);

  const online = async (fn: () => Promise<void>, what: string) => {
    if (!sync.isOnline) return Alert.alert("You're offline", `${what} needs an internet connection.`);
    try {
      await fn();
    } catch (e) {
      Alert.alert(what, (e as Error).message);
    }
  };

  const share = () =>
    Share.share({
      message:
        `Join our family "${household?.name}" on Family EXP 💰\n\n` +
        `1. Install the app and sign in with your phone number\n2. Choose "Join with code"\n3. Enter: ${household?.inviteCode}`,
    });

  const role = (id: string) => memberships.find((m) => m.userId === id)?.role;

  return (
    <Screen bottomInset={110}>
      <Header title="Family" />

      {/* Invite */}
      <Card style={{ backgroundColor: c.primary }}>
        <T variant="caption" color="#FFFFFFB0">{household?.name}</T>
        <T variant="h2" color="#fff" style={{ marginTop: 2 }}>Invite your family</T>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: "#FFFFFF22", borderRadius: radius.md, paddingVertical: 12, alignItems: "center" }}>
            <T variant="h1" color="#fff" style={{ letterSpacing: 5 }} selectable>{household?.inviteCode}</T>
          </View>
          <Pressable
            onPress={share}
            style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="share-social" size={22} color={c.primary} />
          </Pressable>
        </View>
        <T variant="caption" color="#FFFFFFB0" style={{ marginTop: 10 }}>
          Members join with this code. They also need it to sign in on a new phone.
        </T>
        {isOwner && (
          <Pressable
            onPress={() =>
              Alert.alert("New invite code?", "The old code stops working immediately.", [
                { text: "Cancel", style: "cancel" },
                { text: "Change code", onPress: () => online(rotateInviteCode, "Changing the code") },
              ])
            }
          >
            <T variant="caption" color="#fff" style={{ marginTop: 8, textDecorationLine: "underline" }}>Change code</T>
          </Pressable>
        )}
      </Card>

      {/* Members */}
      <SectionHeader title={`Members · ${members.length}`} action="Balance" onAction={() => router.push("/(tabs)/balance")} />
      <Card style={{ paddingVertical: 6 }}>
        {members.map((m) => {
          const b = balances[m.id] ?? 0;
          return (
            <Row
              key={m.id}
              style={{ paddingVertical: 10 }}
              onLongPress={
                isOwner && m.id !== userId
                  ? () =>
                      Alert.alert(`Remove ${m.name}?`, "They will lose access to this family.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => online(() => removeMember(m.id), "Removing a member") },
                      ])
                  : undefined
              }
            >
              <Avatar name={m.name} color={m.color} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{m.name}{m.id === userId ? " (you)" : ""}</T>
                <T variant="caption">{role(m.id) === "owner" ? "Owner" : "Member"}{m.phone ? ` · ${m.phone}` : ""}</T>
              </View>
              {Math.abs(b) < 0.01 ? (
                <T variant="caption">settled</T>
              ) : (
                <Money amount={b} currency={currency} sign color={b > 0 ? c.success : c.danger} variant="h3" />
              )}
            </Row>
          );
        })}
      </Card>

      {/* Settings */}
      <SectionHeader title="Settings" />
      <Card style={{ paddingVertical: 4 }}>
        <Row style={{ paddingVertical: 12 }} onPress={() => router.push("/(tabs)/settings")}>
          <Ionicons name="pricetags-outline" size={20} color={c.ink} />
          <T variant="bodyStrong" style={{ flex: 1 }}>Categories & default splits</T>
          <Ionicons name="chevron-forward" size={18} color={c.sub} />
        </Row>
        <Row style={{ paddingVertical: 12 }} onPress={() => router.push("/recurring")}>
          <Ionicons name="repeat" size={20} color={c.ink} />
          <T variant="bodyStrong" style={{ flex: 1 }}>Recurring bills</T>
          <Ionicons name="chevron-forward" size={18} color={c.sub} />
        </Row>
        <Row style={{ paddingVertical: 12 }} onPress={isOwner ? () => setShowCurrency((v) => !v) : undefined}>
          <Ionicons name="cash-outline" size={20} color={c.ink} />
          <T variant="bodyStrong" style={{ flex: 1 }}>Currency</T>
          <T variant="caption">{currency}{isOwner ? "  ›" : ""}</T>
        </Row>
        {showCurrency && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {CURRENCIES.map((cur) => (
              <Chip
                key={cur}
                label={cur}
                active={cur === currency}
                onPress={() => online(async () => { await updateHousehold({ currency: cur }); setShowCurrency(false); }, "Changing currency")}
              />
            ))}
          </ScrollView>
        )}
        {households.length > 1 && (
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <T variant="caption">Switch family</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {households.map((h) => (
                <Chip key={h.id} label={h.name} active={h.id === hh} onPress={() => switchHousehold(h.id)} />
              ))}
            </View>
          </View>
        )}
      </Card>

      {/* Appearance */}
      <SectionHeader title="Appearance" />
      <Card style={{ gap: 10 }}>
        <Segmented<ThemePref>
          value={themePref}
          onChange={setThemePreference}
          options={[{ value: "light", label: "☀️ Light" }, { value: "dark", label: "🌙 Dark" }, { value: "system", label: "Auto" }]}
        />
        <T variant="caption">Auto follows your phone&apos;s setting. Saved on this phone only.</T>
      </Card>

      {/* Reminders */}
      <SectionHeader title="Reminders" />
      <Card style={{ gap: 12 }}>
        <Row>
          <Ionicons name="notifications-outline" size={20} color={c.ink} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">Daily expense reminder</T>
            <T variant="caption">&quot;Did you enter today&apos;s expenses?&quot; — skipped on days you already did.</T>
          </View>
          <Switch value={reminder.enabled} onValueChange={(v) => updateReminder({ enabled: v })} trackColor={{ true: c.primary }} />
        </Row>
        {reminder.enabled && (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {REMINDER_TIMES.map((t) => (
              <Chip key={t} label={t} active={reminder.time === t} onPress={() => updateReminder({ time: t })} />
            ))}
          </View>
        )}
      </Card>

      {/* Sync */}
      <SectionHeader title="Sync" />
      <Card>
        <Row>
          <Ionicons
            name={sync.isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
            size={22}
            color={sync.isOnline ? c.success : c.sub}
          />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{sync.isOnline ? "Online" : "Offline — changes are saved on this phone"}</T>
            <T variant="caption">
              Last synced {ago(sync.lastSyncAt)}
              {sync.pending ? ` · ${sync.pending} waiting` : ""}
              {sync.failed ? ` · ${sync.failed} failed` : ""}
            </T>
          </View>
        </Row>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Button title="Sync now" variant="dark" icon="sync" loading={sync.isSyncing} onPress={() => syncNow()} style={{ flex: 1, paddingVertical: 12 }} />
          <Button title="Details" variant="ghost" onPress={() => router.push("/sync-queue")} style={{ paddingVertical: 12 }} />
        </View>
      </Card>

      {/* Devices */}
      {devices && devices.length > 0 && (
        <>
          <SectionHeader title="Your signed-in phones" />
          <Card style={{ paddingVertical: 4 }}>
            {devices.map((d) => (
              <Row key={d.id} style={{ paddingVertical: 10 }}>
                <Ionicons name="phone-portrait-outline" size={20} color={c.ink} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong">{d.name}{d.current ? " (this phone)" : ""}</T>
                  <T variant="caption">Active {ago(d.last_seen)}</T>
                </View>
                {!d.current && (
                  <Pressable
                    onPress={() => online(async () => { await api("DELETE", `/me/devices/${d.id}`); loadDevices(); }, "Signing out a phone")}
                  >
                    <T variant="caption" color={c.danger}>Sign out</T>
                  </Pressable>
                )}
              </Row>
            ))}
          </Card>
        </>
      )}

      {/* Account */}
      <SectionHeader title="Account" />
      <Card style={{ gap: 10 }}>
        <T variant="caption">Signed in as {user?.name} · {user?.phone}</T>
        <Button
          title="Leave family"
          variant="danger"
          onPress={() =>
            Alert.alert("Leave family?", "You'll lose access to its expenses on all your phones.", [
              { text: "Cancel", style: "cancel" },
              { text: "Leave", style: "destructive", onPress: () => online(leaveHousehold, "Leaving the family") },
            ])
          }
        />
        <Button
          title="Sign out of this phone"
          variant="ghost"
          onPress={() => {
            const warn = sync.pending > 0 ? `\n\n${sync.pending} change(s) haven't synced yet and will be lost.` : "";
            Alert.alert("Sign out?", `You can sign back in with your number and family code.${warn}`, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void logout() },
            ]);
          }}
        />
      </Card>
    </Screen>
  );
}
