import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "student" | "instructor" | "super_admin" | "parent" | "outreach_officer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  schoolId: string | null;
  /** School URL slug — used to redirect back to /school/:slug on logout */
  schoolSlug: string | null;
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
const CACHE_KEY    = "ace_auth_cache_v2"; // v2 adds cachedAt TTL — busts stale v1 entries
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24 h — role changes in DB show within a day

type RoleCache = { userId: string; role: AppRole; schoolId: string | null; schoolSlug: string | null; cachedAt: number };

function readCache(): RoleCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c: RoleCache = JSON.parse(raw);
    if (!c.cachedAt || Date.now() - c.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null; // expired — forces fresh DB read
    }
    return c;
  } catch { return null; }
}
function writeCache(c: Omit<RoleCache, "cachedAt">) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, cachedAt: Date.now() })); } catch {}
}
function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("ace_auth_cache_v1"); // remove legacy key if present
  } catch {}
}

// ─── Stuck-session recovery ───────────────────────────────────────────────────
// supabase-js coordinates auth refresh across tabs using a browser Navigator
// LockManager lock. If a tab is closed mid-refresh, or a long-idle session
// leaves a stale/invalid refresh token in localStorage, `getSession()` can
// hang forever waiting on that lock instead of resolving OR rejecting — so a
// try/finally around it never runs. The user is stuck on the loading spinner
// with no way out except manually clearing site data. We guard every "should
// finish quickly" auth call with a timeout, and if it fires, wipe the stale
// Supabase auth token(s) from localStorage so the next load starts clean.
const AUTH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function clearStaleSupabaseSession() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  clearCache();
}
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = readCache();

  const [user,     setUser]     = useState<User | null>(null);
  const [session,  setSession]  = useState<Session | null>(null);
  const [role,       setRole]       = useState<AppRole | null>(cache?.role ?? null);
  const [schoolId,   setSchoolId]   = useState<string | null>(cache?.schoolId ?? null);
  const [schoolSlug, setSchoolSlug] = useState<string | null>(cache?.schoolSlug ?? null);
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

    // Fetch the school slug so DashboardLayout can redirect to /school/:slug
    // on logout without needing a DB query after the session is cleared.
    let slug: string | null = null;
    if (s) {
      const { data: schoolData } = await supabase
        .from("schools")
        .select("slug")
        .eq("id", s)
        .maybeSingle();
      slug = schoolData?.slug ?? null;
    }

    setRole(r);
    setSchoolId(s);
    setSchoolSlug(slug);

    if (r) {
      fetchedForRef.current = userId;
      writeCache({ userId, role: r, schoolId: s, schoolSlug: slug });
    }
  };

  useEffect(() => {
    let alive = true;

    // ── 1. Initialise from the persisted Supabase session ─────────────────
    (async () => {
      try {
        let s;
        try {
          const result = await withTimeout(
            supabase.auth.getSession(),
            AUTH_TIMEOUT_MS,
            "getSession()"
          );
          s = result.data.session;
        } catch (err) {
          // getSession() hung (stuck lock) or rejected (invalid/corrupted
          // refresh token). Either way, the stored session can't be trusted —
          // wipe it and fall through to a logged-out state instead of leaving
          // the person stuck on the spinner forever.
          console.warn("Auth session restore failed, clearing stale session:", err);
          clearStaleSupabaseSession();
          s = null;
        }
        if (!alive) return;

        setSession(s ?? null);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Only hit the DB if we don't already have this user's role cached.
          if (fetchedForRef.current !== s.user.id) {
            try {
              await withTimeout(fetchRole(s.user.id), AUTH_TIMEOUT_MS, "fetchRole()");
            } catch (err) {
              // Role fetch hung/failed — don't block the app forever; let it
              // render with role null (route guards will redirect as needed).
              console.warn("Role fetch failed or timed out:", err);
            }
          }
        } else {
          setRole(null);
          setSchoolId(null);
          setSchoolSlug(null);
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
          try {
            await withTimeout(fetchRole(newSession.user.id), AUTH_TIMEOUT_MS, "fetchRole()");
          } catch (err) {
            console.warn("Role fetch failed or timed out:", err);
          } finally {
            if (alive) setLoading(false);
          }
        } else {
          // Signed out
          setRole(null);
          setSchoolId(null);
          setSchoolSlug(null);
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
    setUser(null); setSession(null); setRole(null); setSchoolId(null); setSchoolSlug(null);
    clearCache();
    fetchedForRef.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, schoolId, schoolSlug, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
