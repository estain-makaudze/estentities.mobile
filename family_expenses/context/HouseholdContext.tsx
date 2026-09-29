import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getMeta, setMeta } from "../db/database";
import { notifyDataChanged, useDataVersion } from "../db/events";
import { listHouseholds, listMembers, listUsers } from "../db/repo";
import { api } from "../services/api";
import { syncNow } from "../services/syncEngine";
import type { Household, HouseholdMember, User } from "../types";
import { useAuth } from "./AuthContext";

/**
 * Current family + members, read from SQLite (works offline).
 * Creating / joining / leaving a family needs the server (online only).
 */

interface HouseholdContextValue {
  household: Household | null;
  households: Household[];
  /** Active members as users (for splits, pickers, balances) */
  members: User[];
  memberships: HouseholdMember[];
  isOwner: boolean;
  currency: string;
  userName: (id: string) => string;
  userColor: (id: string) => string;
  createHousehold: (name: string, currency: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  leaveHousehold: () => Promise<void>;
  rotateInviteCode: () => Promise<void>;
  updateHousehold: (patch: { name?: string; currency?: string }) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  switchHousehold: (id: string) => void;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const version = useDataVersion();
  const [selected, setSelected] = useState<string | null>(() => getMeta("householdId"));

  const data = useMemo(() => {
    void version;
    if (!userId) return { households: [], household: null, memberships: [], members: [], allUsers: [] };
    const households = listHouseholds();
    const household = households.find((h) => h.id === selected) ?? households[0] ?? null;
    const memberships = household ? listMembers(household.id) : [];
    const allUsers = listUsers();
    const members = memberships
      .map((m) => allUsers.find((u) => u.id === m.userId))
      .filter((u): u is User => !!u);
    return { households, household, memberships, members, allUsers };
  }, [userId, selected, version]);

  const switchHousehold = useCallback((id: string) => {
    setMeta("householdId", id);
    setSelected(id);
    notifyDataChanged();
  }, []);

  const adopt = useCallback(async (h: { id: string }) => {
    setMeta("householdId", h.id);
    setSelected(h.id);
    // New family → its history predates our cursor: pull everything.
    await syncNow({ full: true });
    notifyDataChanged();
  }, []);

  const createHousehold = useCallback(async (name: string, currency: string) => {
    const res = await api<{ household: { id: string } }>("POST", "/households", { name, currency });
    await adopt(res.household);
  }, [adopt]);

  const joinHousehold = useCallback(async (code: string) => {
    const res = await api<{ household: { id: string } }>("POST", "/households/join", { code });
    await adopt(res.household);
  }, [adopt]);

  const hid = data.household?.id;

  const leaveHousehold = useCallback(async () => {
    if (!hid) return;
    await api("POST", `/households/${hid}/leave`, {});
    setMeta("householdId", null);
    setSelected(null);
    await syncNow({ full: true });
  }, [hid]);

  const rotateInviteCode = useCallback(async () => {
    if (!hid) return;
    await api("POST", `/households/${hid}/rotate-code`, {});
    await syncNow();
  }, [hid]);

  const updateHousehold = useCallback(async (patch: { name?: string; currency?: string }) => {
    if (!hid) return;
    await api("PATCH", `/households/${hid}`, patch);
    await syncNow();
  }, [hid]);

  const removeMember = useCallback(async (memberId: string) => {
    if (!hid) return;
    await api("DELETE", `/households/${hid}/members/${memberId}`);
    await syncNow();
  }, [hid]);

  const value = useMemo<HouseholdContextValue>(() => {
    const byId = new Map(data.allUsers.map((u) => [u.id, u]));
    return {
      household: data.household,
      households: data.households,
      members: data.members,
      memberships: data.memberships,
      isOwner: !!data.household && data.household.ownerId === userId,
      currency: data.household?.currency ?? "USD",
      userName: (id) => (id === userId ? "You" : byId.get(id)?.name ?? "Former member"),
      userColor: (id) => byId.get(id)?.color ?? "#8A8F9C",
      createHousehold,
      joinHousehold,
      leaveHousehold,
      rotateInviteCode,
      updateHousehold,
      removeMember,
      switchHousehold,
    };
  }, [data, userId, createHousehold, joinHousehold, leaveHousehold, rotateInviteCode, updateHousehold,
      removeMember, switchHousehold]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}
