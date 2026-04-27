import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "student" | "instructor" | "super_admin" | "parent" | "outreach_officer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  schoolId: string | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, schoolId?: string, className?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Persistent role cache ────────────────────────────────────────────────────
// Role never changes between sessions for the same user, so we cache it in
// localStorage. This means role + schoolId are available synchronously on first
// render — no loading flash, no blank screen, no page remount on tab switch.
const CACHE_KEY = "ace_auth_cache_v1";

type RoleCache = { userId: string; role: AppRole; schoolId: string | null };

function readCache(): RoleCache | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"); }
  catch { return null; }
}
function writeCache(c: RoleCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}
function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = readCache();

  const [user,     setUser]     = useState<User | null>(null);
  const [session,  setSession]  = useState<Session | null>(null);
  const [role,     setRole]     = useState<AppRole | null>(cache?.role ?? null);
  const [schoolId, setSchoolId] = useState<string | null>(cache?.schoolId ?? null);
  // Skip the loading spinner entirely when we already have a cached role.
  const [loading,  setLoading]  = useState<boolean>(!cache);

  // Which userId has already had its role fetched this session.
  const fetchedForRef = useRef<string | null>(cache?.userId ?? null);

  const fetchRole = async (userId: string): Promise<void> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) console.error("fetchRole error:", error);

    const r = (data?.role as AppRole) ?? null;
    const s = data?.school_id ?? null;

    setRole(r);
    setSchoolId(s);

    if (r) {
      fetchedForRef.current = userId;
      writeCache({ userId, role: r, schoolId: s });
    }
  };

  useEffect(() => {
    let alive = true;

    // ── 1. Initialise from the persisted Supabase session ─────────────────
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!alive) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Only hit the DB if we don't already have this user's role cached.
          if (fetchedForRef.current !== s.user.id) {
            await fetchRole(s.user.id);
          }
        } else {
          setRole(null);
          setSchoolId(null);
          clearCache();
          fetchedForRef.current = null;
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // ── 2. Listen for future auth events ─────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!alive) return;

        // ── THE KEY FIX ───────────────────────────────────────────────────
        //
        // Every time a browser tab becomes visible, Supabase v2 calls
        // _onVisibilityChanged → _recoverAndRefresh internally.
        // This fires one of these events on our listener:
        //
        //   • TOKEN_REFRESHED  – token was near expiry, silently refreshed
        //   • SIGNED_IN        – called by _recoverAndRefresh even if the user
        //                        was already signed in (this is the bug source)
        //   • INITIAL_SESSION  – fires once when the listener first subscribes
        //
        // When any of these fire for a user we ALREADY know about, we must
        // update the session object (so the JWT stays fresh) but must NOT
        // touch `loading` or re-fetch the role. Doing so causes ProtectedRoute
        // to re-render, which unmounts + remounts the page and re-runs all
        // useEffect data fetches — i.e. the "refresh on tab switch" bug.
        //
        // We detect "already known user" by comparing the incoming userId to
        // the one we've already fetched a role for.
        // ─────────────────────────────────────────────────────────────────

        const isSilentResume =
          (event === "TOKEN_REFRESHED" ||
           event === "SIGNED_IN" ||
           event === "INITIAL_SESSION") &&
          newSession?.user?.id !== undefined &&
          newSession.user.id === fetchedForRef.current;

        if (isSilentResume) {
          // Just refresh the JWT in state — no loading, no role re-fetch.
          setSession(newSession);
          setUser(newSession!.user);
          return;
        }

        // ── Genuine state change (first sign-in, sign-out, account switch) ──
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // New user we haven't seen — fetch role with loading indicator.
          setLoading(true);
          await fetchRole(newSession.user.id);
          if (alive) setLoading(false);
        } else {
          // Signed out
          setRole(null);
          setSchoolId(null);
          clearCache();
          fetchedForRef.current = null;
        }
      }
    );

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Auth actions ──────────────────────────────────────────────────────────
  const signUp = async (
    email: string, password: string, fullName: string,
    schoolIdParam?: string, className?: string
  ) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, class_name: className ?? "", school_id: schoolIdParam ?? "" },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setSession(null); setRole(null); setSchoolId(null);
    clearCache();
    fetchedForRef.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, schoolId, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
