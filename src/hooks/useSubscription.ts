/**
 * useSubscription
 *
 * Reads the school's subscription_status directly from the DB.
 * This means super-admin overrides reflect immediately — we do NOT
 * recompute from expiry_date on the client (the DB trigger / RPC handles that).
 *
 * Status rules (enforced in DB, mirrored here for display):
 *   active     → full access
 *   grace      → full access + warning banner
 *   restricted → read-only (create/publish/add blocked)
 *   suspended  → full block (SubscriptionGuard shows lockout screen)
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type SubscriptionStatus = "active" | "grace" | "restricted" | "suspended";
export type SubscriptionPlan   = "trial" | "basic" | "standard" | "premium";

export interface SubscriptionInfo {
  status:          SubscriptionStatus;
  plan:            SubscriptionPlan;
  expiryDate:      string | null;
  lastPaymentDate: string | null;
  daysUntilExpiry: number | null;
  showBanner:      boolean;
  isGrace:         boolean;
  isRestricted:    boolean;
  isSuspended:     boolean;
  daysPastExpiry:  number;
}

/**
 * Pure helper used only for display previews in the super-admin UI.
 * The authoritative status lives in schools.subscription_status (DB).
 */
export function computeStatus(expiryDate: string | null): SubscriptionStatus {
  if (!expiryDate) return "active";
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
  const diff   = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diff >= 0)   return "active";
  if (diff >= -7)  return "grace";
  if (diff >= -14) return "restricted";
  return "suspended";
}

const BYPASS_ROLES = new Set(["super_admin", "outreach_officer", "student", "parent"]);

export function useSubscription() {
  const { schoolId, role } = useAuth();
  const queryClient = useQueryClient();

  const enabled = !!schoolId && !!role && !BYPASS_ROLES.has(role);

  const { data: subscription, isLoading } = useQuery<SubscriptionInfo>({
    queryKey: ["subscription", schoolId],
    enabled,
    staleTime: 5 * 60 * 1000,    // 5 min — subscription status rarely changes mid-session
    gcTime:    10 * 60 * 1000,   // keep cached 10 min after component unmounts
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,   // reconnect shouldn't trigger a subscription re-check
    queryFn: async (): Promise<SubscriptionInfo> => {
      const { data, error } = await supabase
        .from("schools")
        .select("subscription_plan, subscription_status, expiry_date, last_payment_date")
        .eq("id", schoolId!)
        .single();

      if (error || !data) {
        return {
          status: "active", plan: "basic", expiryDate: null,
          lastPaymentDate: null, daysUntilExpiry: null,
          showBanner: false, isGrace: false, isRestricted: false,
          isSuspended: false, daysPastExpiry: 0,
        };
      }

      const d = data as any;
      // KEY FIX: read stored status — not recomputed — so overrides take effect
      const status: SubscriptionStatus = d.subscription_status ?? "active";
      const expiry: string | null = d.expiry_date ?? null;

      const daysUntilExpiry = expiry
        ? Math.floor((new Date(expiry).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000)
        : null;
      const daysPastExpiry = daysUntilExpiry !== null && daysUntilExpiry < 0
        ? Math.abs(daysUntilExpiry) : 0;

      return {
        status,
        plan:            d.subscription_plan  ?? "basic",
        expiryDate:      expiry,
        lastPaymentDate: d.last_payment_date  ?? null,
        daysUntilExpiry,
        daysPastExpiry,
        showBanner:  status === "grace" || status === "restricted",
        isGrace:     status === "grace",
        isRestricted:status === "restricted",
        isSuspended: status === "suspended",
      };
    },
  });

  const status: SubscriptionStatus = enabled ? (subscription?.status ?? "active") : "active";

  const canCreateExam = useCallback((): boolean => {
    if (status === "restricted" || status === "suspended") {
      toast.error("Subscription expired — renew to create or edit exams.");
      return false;
    }
    return true;
  }, [status]);

  const canPublishExam = useCallback((): boolean => {
    if (status === "restricted" || status === "suspended") {
      toast.error("Subscription expired — renew to publish exams.");
      return false;
    }
    return true;
  }, [status]);

  const canAddStudent = useCallback((): boolean => {
    if (status === "restricted" || status === "suspended") {
      toast.error("Subscription expired — renew to add or edit students.");
      return false;
    }
    return true;
  }, [status]);

  const canPublishResults = useCallback((): boolean => {
    if (status === "restricted" || status === "suspended") {
      toast.error("Subscription expired — renew to publish results or grades.");
      return false;
    }
    return true;
  }, [status]);

  const canWrite = useCallback((): boolean => {
    if (status === "restricted" || status === "suspended") {
      toast.error("Your subscription has expired. Please renew to make changes.");
      return false;
    }
    return true;
  }, [status]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["subscription", schoolId] });
  }, [queryClient, schoolId]);

  return {
    subscription,
    status,
    isLoading,
    isActive:     status === "active",
    isGrace:      status === "grace",
    isRestricted: status === "restricted",
    isSuspended:  status === "suspended",
    canCreateExam,
    canPublishExam,
    canAddStudent,
    canPublishResults,
    canWrite,
    invalidate,
  };
}
