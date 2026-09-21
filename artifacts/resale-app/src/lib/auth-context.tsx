import { setAuthTokenGetter } from "@workspace/api-client-react";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, authConfigurationReady, getAccessToken, supabase } from "./supabase";

type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
};

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(): Promise<UserProfile | null> {
  const response = await apiFetch("/api/auth/me");
  if (!response.ok) return null;
  return response.json() as Promise<UserProfile>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setAuthTokenGetter(getAccessToken);
    if (!authConfigurationReady) {
      setReady(true);
      return () => setAuthTokenGetter(null);
    }

    let active = true;
    const hydrate = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setProfile(nextSession ? await fetchProfile() : null);
      if (active) setReady(true);
    };

    void supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { void hydrate(nextSession); });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    user: session?.user ?? null,
    profile,
    configurationError: authConfigurationReady ? null : "Authentication is not configured for this deployment yet.",
    signIn: async (email, password) => {
      if (!authConfigurationReady) return "Authentication is not configured for this deployment yet.";
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error?.message ?? null;
    },
    signUp: async (email, password, displayName) => {
      if (!authConfigurationReady) return { error: "Authentication is not configured for this deployment yet.", confirmationRequired: false };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      return { error: error?.message ?? null, confirmationRequired: !data.session };
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
    refreshProfile: async () => {
      setProfile(await fetchProfile());
    },
  }), [profile, ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
