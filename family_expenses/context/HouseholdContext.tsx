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
// Helpers
// ---------------------------------------------------------------------------
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

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
    const { data: memberRow } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .single();

    if (!memberRow) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    // Fetch household details.
    const { data: hh } = await supabase
      .from("households")
      .select("id, name, invite_code, created_at")
      .eq("id", memberRow.household_id)
      .single();

    if (!hh) {
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

    if (memberRows && memberRows.length > 0) {
      const userIds = memberRows.map((r: { user_id: string }) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, color")
        .in("id", userIds);

      const users: User[] = (profiles ?? []).map(
        (p: { id: string; name: string; color: string }, idx: number) => ({
          id: p.id,
          name: p.name || `Member ${idx + 1}`,
          color: p.color || USER_COLORS[idx % USER_COLORS.length],
        })
      );
      setMembers(users);
    } else {
      setMembers([]);
    }

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

      // Keep trying until we get a unique invite code.
      let inviteCode = generateInviteCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: conflict } = await supabase
          .from("households")
          .select("id")
          .eq("invite_code", inviteCode)
          .single();
        if (!conflict) break;
        inviteCode = generateInviteCode();
      }

      const { data: hh, error: hhErr } = await supabase
        .from("households")
        .insert({ name: name.trim(), invite_code: inviteCode })
        .select()
        .single();

      if (hhErr || !hh) return { error: hhErr?.message ?? "Failed to create household." };

      const { error: memberErr } = await supabase
        .from("household_members")
        .insert({ household_id: hh.id, user_id: session.user.id });

      if (memberErr) return { error: memberErr.message };

      await fetchHousehold();
      return {};
    },
    [session?.user.id, fetchHousehold]
  );

  const joinHousehold = useCallback(
    async (inviteCode: string): Promise<{ error?: string }> => {
      if (!session?.user.id) return { error: "Not authenticated." };

      const { data: hh, error: hhErr } = await supabase
        .from("households")
        .select("id, name, invite_code, created_at")
        .eq("invite_code", inviteCode.trim().toUpperCase())
        .single();

      if (hhErr || !hh) return { error: "Invalid invite code. Please check and try again." };

      // Check if already a member.
      const { data: existing } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("household_id", hh.id)
        .eq("user_id", session.user.id)
        .single();

      if (existing) {
        // Already a member — just load it.
        await fetchHousehold();
        return {};
      }

      const { error: memberErr } = await supabase
        .from("household_members")
        .insert({ household_id: hh.id, user_id: session.user.id });

      if (memberErr) return { error: memberErr.message };

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
