import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../services/supabase";
import { Household, User } from "../types";
import { USER_COLORS } from "../constants/colors";
import { useAuth } from "./AuthContext";
import {
  loadHouseholdCache,
  saveHouseholdCache,
  clearHouseholdCache,
} from "../utils/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isNetworkError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network request failed") ||
    msg.includes("networkerror") ||
    msg.includes("fetch error")
  );
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface HouseholdContextValue {
  household: Household | null;
  members: User[];
  loading: boolean;
  createHousehold: (name: string) => Promise<{ error?: string }>;
  joinHousehold: (inviteCode: string) => Promise<{ error?: string }>;
  leaveHousehold: () => Promise<{ error?: string }>;
  refreshHousehold: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHousehold = useCallback(async () => {
    if (!session?.user.id) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Find the household this user belongs to.
    const { data: memberRow, error: memberError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .single();

    if (memberError) {
      if (isNetworkError(memberError)) {
        // Offline → try local cache so the user can continue using the app.
        const cached = await loadHouseholdCache(session.user.id);
        if (cached) {
          setHousehold(cached.household);
          setMembers(cached.members);
          setLoading(false);
          return;
        }
      }
      // Either not a member, or cache is empty.
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    if (!memberRow) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    // Fetch household details.
    const { data: hh, error: hhError } = await supabase
      .from("households")
      .select("id, name, invite_code, created_at")
      .eq("id", memberRow.household_id)
      .single();

    if (!hh) {
      if (hhError && isNetworkError(hhError)) {
        const cached = await loadHouseholdCache(session.user.id);
        if (cached) {
          setHousehold(cached.household);
          setMembers(cached.members);
          setLoading(false);
          return;
        }
      }
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setHousehold(hh as Household);

    // Fetch household members with their profiles.
    const { data: memberRows } = await supabase
      .from("household_members")
      .select("user_id, joined_at")
      .eq("household_id", hh.id);

    let users: User[] = [];
    if (memberRows && memberRows.length > 0) {
      const userIds = memberRows.map((r: { user_id: string }) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, color")
        .in("id", userIds);

      users = (profiles ?? []).map(
        (p: { id: string; name: string; color: string }, idx: number) => ({
          id: p.id,
          name: p.name || `Member ${idx + 1}`,
          color: p.color || USER_COLORS[idx % USER_COLORS.length],
        })
      );
    }
    setMembers(users);

    // Persist for offline use.
    await saveHouseholdCache(session.user.id, { household: hh as Household, members: users });

    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  // Subscribe to household_members changes for real-time member updates.
  useEffect(() => {
    if (!household?.id) return;

    const channel = supabase
      .channel(`household_members:${household.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_members",
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          fetchHousehold();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [household?.id, fetchHousehold]);

  const createHousehold = useCallback(
    async (name: string): Promise<{ error?: string }> => {
      if (!session?.user.id) return { error: "Not authenticated." };

      // create_household is a SECURITY DEFINER RPC that:
      //   1. Generates a unique invite code server-side
      //   2. INSERTs the household row
      //   3. INSERTs the creator as the first member
      // All in one atomic transaction, bypassing RLS.
      const { data, error } = await supabase.rpc("create_household", {
        household_name: name.trim(),
      });

      if (error) return { error: error.message };
      if (data?.error) return { error: data.error as string };

      await fetchHousehold();
      return {};
    },
    [session?.user.id, fetchHousehold]
  );

  const joinHousehold = useCallback(
    async (inviteCode: string): Promise<{ error?: string }> => {
      if (!session?.user.id) return { error: "Not authenticated." };

      // join_household_by_code is a SECURITY DEFINER RPC that can SELECT
      // the household by invite_code even though the user isn't a member yet
      // (plain client-side SELECT would be blocked by RLS).
      const { data, error } = await supabase.rpc("join_household_by_code", {
        p_invite_code: inviteCode.trim().toUpperCase(),
      });

      if (error) return { error: error.message };
      if (data?.error) return { error: data.error as string };

      await fetchHousehold();
      return {};
    },
    [session?.user.id, fetchHousehold]
  );

  const leaveHousehold = useCallback(async (): Promise<{ error?: string }> => {
    if (!session?.user.id || !household?.id) return { error: "No household to leave." };

    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", household.id)
      .eq("user_id", session.user.id);

    if (error) return { error: error.message };

    await clearHouseholdCache(session.user.id);
    setHousehold(null);
    setMembers([]);
    return {};
  }, [session?.user.id, household?.id]);

  return (
    <HouseholdContext.Provider
      value={{
        household,
        members,
        loading,
        createHousehold,
        joinHousehold,
        leaveHousehold,
        refreshHousehold: fetchHousehold,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}
