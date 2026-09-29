import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { db, getMeta, initDatabase, resetDatabase, setMeta } from "../db/database";
import { notifyDataChanged, useDataVersion } from "../db/events";
import { listUsers } from "../db/repo";
import { api, ApiError, loadToken, saveToken } from "../services/api";
import { resetSyncState, startSyncEngine, syncNow } from "../services/syncEngine";
import { useSyncStatus } from "../hooks/useSync";
import type { User } from "../types";

/**
 * Session = device token (SecureStore) + userId (SQLite meta).
 * Everything here is readable offline, so a cold start never needs the network.
 */

interface AuthContextValue {
  ready: boolean;
  userId: string | null;
  user: User | null;
  /** Phone + name login. Throws ApiError; code INVITE_REQUIRED means ask for the family code. */
  login: (phone: string, name: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; color?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type LoginResponse = { token: string; user: User };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const version = useDataVersion();
  const { signedOut } = useSyncStatus();

  useEffect(() => {
    initDatabase();
    loadToken()
      .then((token) => {
        const id = getMeta("userId");
        if (token && id) setUserId(id);
      })
      .finally(() => {
        setReady(true);
        startSyncEngine();
      });
  }, []);

  const user = useMemo(() => {
    void version;
    return userId ? listUsers([userId])[0] ?? null : null;
  }, [userId, version]);

  const login = useCallback(async (phone: string, name: string, inviteCode?: string) => {
    const deviceName = Constants.deviceName ?? "Phone";
    const res = await api<LoginResponse>("POST", "/auth/login", { phone, name, inviteCode, deviceName });
    resetDatabase();
    await saveToken(res.token);
    setMeta("userId", res.user.id);
    resetSyncState();
    // Seed own profile so the UI has a name before the first pull lands.
    db.runSync("INSERT OR REPLACE INTO users (id, name, color, phone) VALUES (?, ?, ?, ?)",
      res.user.id, res.user.name, res.user.color, res.user.phone ?? null);
    await syncNow({ full: true });
    // Pick the first family (if any) as current.
    const hh = db.getFirstSync<{ id: string }>("SELECT id FROM households ORDER BY name LIMIT 1");
    if (hh) setMeta("householdId", hh.id);
    notifyDataChanged();
    setUserId(res.user.id);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("POST", "/auth/logout", {}, 5000);
    } catch {
      // offline logout is fine — token is wiped locally regardless
    }
    await saveToken(null);
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    resetDatabase();
    resetSyncState();
    notifyDataChanged();
    setUserId(null);
  }, []);

  // Device was revoked on the server (e.g. from another phone) → sign out here too.
  useEffect(() => {
    if (signedOut && userId) {
      saveToken(null).then(() => {
        resetDatabase();
        resetSyncState();
        notifyDataChanged();
        setUserId(null);
      });
    }
  }, [signedOut, userId]);

  const updateProfile = useCallback(async (patch: { name?: string; color?: string }) => {
    const res = await api<{ user: User }>("PATCH", "/me", patch);
    db.runSync("UPDATE users SET name = ?, color = ? WHERE id = ?", res.user.name, res.user.color, res.user.id);
    notifyDataChanged();
  }, []);

  const value = useMemo(
    () => ({ ready, userId, user, login, logout, updateProfile }),
    [ready, userId, user, login, logout, updateProfile]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
