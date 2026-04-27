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

// ─── Role cache ──────────────────────────────────────────────────────────────
// Persist role + schoolId in localStorage so they are available synchronously
// on the very first render (before any network request). This prevents the
// ProtectedRoute from showing a loading spinner or redirecting to "/" every
// time the user switches browser tabs (which triggers a Supabase TOKEN_REFRESHED
// event and previously caused a full page re-render cycle).
const ROLE_CACHE_KEY = "ace_auth_role_cache";

function readRoleCache(): { role: AppRole; schoolId: string | null; userId: string } | null {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRoleCache(userId: string, role: AppRole, schoolId: string | null) {
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role, schoolId }));
  } catch {}
}

function clearRoleCache() {
  try {
    localStorage.removeItem(ROLE_CACHE_KEY);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed state from cache so first render already has role/schoolId
  const cache = readRoleCache();

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(cache?.role ?? null);
  const [schoolId, setSchoolId] = useState<string | null>(cache?.schoolId ?? null);
  // If we have a valid cache we can skip the initial loading flash entirely.
  // We still verify in the background but the UI never goes blank.
  const [loading, setLoading] = useState(!cache);

  // Track whether we've already fetched the role for the current user so we
  // don't make redundant DB round-trips on every TOKEN_REFRESHED event.
  const roleFetchedForRef = useRef<string | null>(cache ? cache.userId : null);

  const fetchRole = async (userId: string) => {
    // Skip if we already have the role for this exact user
    if (roleFetchedForRef.current === userId && role !== null) return;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch user role:", error);
    }

    const newRole = (data?.role as AppRole) ?? null;
    const newSchoolId = data?.school_id ?? null;

    setRole(newRole);
    setSchoolId(newSchoolId);

    if (newRole) {
      roleFetchedForRef.current = userId;
      writeRoleCache(userId, newRole, newSchoolId);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // If cache matches this user, role is already set — no fetch needed
          if (roleFetchedForRef.current !== currentSession.user.id || role === null) {
            await fetchRole(currentSession.user.id);
          }
        } else {
          // No session — clear everything
          setRole(null);
          setSchoolId(null);
          clearRoleCache();
          roleFetchedForRef.current = null;
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;

        // TOKEN_REFRESHED fires every time the browser tab becomes visible again
        // (Supabase silently refreshes the JWT in the background).
        // INITIAL_SESSION fires on first load.
        // For both of these we just update the session object without touching
        // loading state or re-fetching the role — the cache already has it.
        const isSilentEvent =
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION";

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          if (isSilentEvent) {
            // Role is already in state (and cache) — nothing else to do.
            return;
          }

          // SIGNED_IN, USER_UPDATED, etc. — fetch role if we don't have it yet
          if (roleFetchedForRef.current !== newSession.user.id || role === null) {
            setLoading(true);
            setTimeout(async () => {
              await fetchRole(newSession.user.id);
              if (isMounted) setLoading(false);
            }, 0);
          }
        } else {
          // SIGNED_OUT
          setRole(null);
          setSchoolId(null);
          clearRoleCache();
          roleFetchedForRef.current = null;
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (email: string, password: string, fullName: string, schoolIdParam?: string, className?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          class_name: className || "",
          school_id: schoolIdParam || "",
        },
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
    setUser(null);
    setSession(null);
    setRole(null);
    setSchoolId(null);
    clearRoleCache();
    roleFetchedForRef.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, schoolId, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
