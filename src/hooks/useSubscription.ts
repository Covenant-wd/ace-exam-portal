/**
 * useSubscription
 *
 * Central hook for subscription status. Used by:
 *  - SubscriptionBanner    → shows warning/restricted/suspended banners
 *  - SubscriptionGuard     → blocks suspended schools entirely
 *  - Exams page            → canCreateExam(), canPublishExam()
 *  - Students page         → canAddStudent()
 *  - Grades page           → canPublishResults()
 *
 * Status rules (mirror SQL compute_subscription_status()):
 *   today <= expiry_date           → active
 *   within 7 days after expiry    → grace      (full access + warning)
 *   within 14 days after expiry   → restricted (read-only)
 *   beyond 14 days after expiry   → suspended  (full block)
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type SubscriptionStatus = "active" | "grace" | "restricted" | "suspended";

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: string;
  expiryDate: string | null;
  lastPaymentDate: string | null;
  daysUntilExpiry: number | null;
}

/** Pure function — mirrors the SQL trigger. Used server-side and client-side. */
export function computeStatus(expiryDate: string | null): SubscriptionStatus {
  if (!expiryDate) return "active";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diff = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diff >= 0)   return "active";
  if (diff >= -7)  return "grace";
  if (diff >= -14) return "restricted";
  return "suspended";
}

const BYPASS_ROLES = new Set(["super_admin", "outreach_officer", "student", "parent"]);

export function useSubscription() {
  const { schoolId, role } = useAuth();

  // Only school admins + instructors are subject to subscription checks
  const enabled = !!schoolId && !!role && !BYPASS_ROLES.has(role);

  const { data: subscription, isLoading } = useQuery<SubscriptionInfo>({
    queryKey: ["subscription", schoolId],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SubscriptionInfo> => {
      const { data, error } = await supabase
        .from("schools")
        .select("subscription_plan, expiry_date, last_payment_date")
        .eq("id", schoolId!)
        .single();

      if (error || !data) {
        return { status: "active", plan: "basic", expiryDate: null, lastPaymentDate: null, daysUntilExpiry: null };
      }

      const expiry: string | null = (data as any).expiry_date ?? null;
      const status = computeStatus(expiry);
      const daysUntilExpiry = expiry
        ? Math.floor((new Date(expiry).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000)
        : null;

      return {
        status,
        plan: (data as any).subscription_plan ?? "basic",
        expiryDate: expiry,
        lastPaymentDate: (data as any).last_payment_date ?? null,
        daysUntilExpiry,
      };
    },
  });

  const status: SubscriptionStatus = enabled ? (subscription?.status ?? "active") : "active";

  // ── Write-action guards ────────────────────────────────────────────────────

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
  };
}
