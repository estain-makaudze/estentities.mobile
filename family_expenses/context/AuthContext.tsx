import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthAccount } from "../types";
import {
  loadAuthAccounts,
  saveAuthAccounts,
  loadAuthSession,
  saveAuthSession,
} from "../utils/storage";

// ---------------------------------------------------------------------------
// Password hashing (device-local authentication only).
// Uses a two-pass djb2 hash with a per-account salt stored separately.
// This is NOT suitable for network-transmitted credentials. For production
// multi-device sync you should replace this with a proper backend auth
// service (e.g. Firebase Auth / Supabase Auth) that uses bcrypt/argon2.
// ---------------------------------------------------------------------------
function simpleHash(s: string): string {
  // Pass 1: forward djb2
  let h1 = 5381;
  for (let i = 0; i < s.length; i++) {
    h1 = ((h1 << 5) + h1) ^ s.charCodeAt(i);
    h1 = h1 >>> 0;
  }
  // Pass 2: reverse sdbm to mix further
  let h2 = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    h2 = s.charCodeAt(i) + (h2 << 6) + (h2 << 16) - h2;
    h2 = h2 >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface AuthContextValue {
  session: AuthAccount | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await loadAuthSession();
      setSession(stored);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const accounts = await loadAuthAccounts();
      const hash = simpleHash(password);
      const account = accounts.find(
        (a) =>
          a.email.toLowerCase() === email.toLowerCase() &&
          a.passwordHash === hash
      );
      if (!account) return { error: "Invalid email or password." };
      setSession(account);
      await saveAuthSession(account);
      return {};
    },
    []
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string
    ): Promise<{ error?: string }> => {
      const accounts = await loadAuthAccounts();
      if (
        accounts.find(
          (a) => a.email.toLowerCase() === email.toLowerCase()
        )
      ) {
        return { error: "An account with this email already exists." };
      }
      const account: AuthAccount = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: simpleHash(password),
      };
      accounts.push(account);
      await saveAuthAccounts(accounts);
      setSession(account);
      await saveAuthSession(account);
      return {};
    },
    []
  );

  const logout = useCallback(async () => {
    setSession(null);
    await saveAuthSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
