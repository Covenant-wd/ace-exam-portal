/**
 * useSubscription
 *
 * Central hook that fetches a school's subscription status once
 * and caches it for the session. Every admin page imports this
 * to check whether actions are allowed.
 *
 * The computed_status field is derived server-side from expiry_date
 * so it's always accurate regardless of when sync_subscription_statuses
 * last ran.
 *
 * Status hierarchy:
 *   active     → full access
 *   grace      → full access + warning banner
 *   restricted → read-only (no creating exams/students, no publishing)
 *   suspended  → blocked entirely (redirect to payment page)
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus = "active" | "grace" | "restricted" | "suspended";
export type SubscriptionPlan   = "trial" | "basic" | "standard" | "premium";

export interface SubscriptionInfo {
  schoolId:         string;
  plan:             SubscriptionPlan;
  status:           SubscriptionStatus;  // computed_status — always fresh
  expiryDate:       string | null;
  lastPaymentDate:  string | null;
  daysUntilExpiry:  number | null;
  daysPastExpiry:   number;
  // Derived permission flags — use these in feature guards
  canCreate:        boolean;  // false when restricted or suspended
  canPublish:       boolean;  // false when restricted or suspended
  showBanner:       boolean;  // true when grace or restricted
  isSuspended:      boolean;
  isRestricted:     boolean;
  isGrace:          boolean;
}

interface State {
  info: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
}

// In-memory cache so we don't refetch on every component mount
const cache = new Map<string, SubscriptionInfo>();

export function useSubscription(schoolId: string | null): State & { refetch: () => void } {
  const [state, setState] = useState<State>({
    info: schoolId ? (cache.get(schoolId) ?? null) : null,
    loading: !schoolId ? false : !cache.has(schoolId!),
    error: null,
  });

  const fetch = useCallback(async () => {
    if (!schoolId) return;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { data, error } = await supabase.rpc("get_school_subscription", {
        _school_id: schoolId,
      } as any);

      if (error) throw error;
      if (!data || (data as any[]).length === 0) {
        // School has no subscription row yet — treat as active (trial)
        const info: SubscriptionInfo = {
          schoolId,
          plan:            "trial",
          status:          "active",
          expiryDate:      null,
          lastPaymentDate: null,
          daysUntilExpiry: null,
          daysPastExpiry:  0,
          canCreate:       true,
          canPublish:      true,
          showBanner:      false,
          isSuspended:     false,
          isRestricted:    false,
          isGrace:         false,
        };
        cache.set(schoolId, info);
        setState({ info, loading: false, error: null });
        return;
      }

      const row = (data as any[])[0];
      const status = (row.computed_status ?? "active") as SubscriptionStatus;

      const info: SubscriptionInfo = {
        schoolId,
        plan:            row.subscription_plan as SubscriptionPlan,
        status,
        expiryDate:      row.expiry_date      ?? null,
        lastPaymentDate: row.last_payment_date ?? null,
        daysUntilExpiry: row.days_until_expiry ?? null,
        daysPastExpiry:  Number(row.days_past_expiry) || 0,
        // Permission flags
        canCreate:   status === "active" || status === "grace",
        canPublish:  status === "active" || status === "grace",
        showBanner:  status === "grace" || status === "restricted",
        isSuspended: status === "suspended",
        isRestricted: status === "restricted",
        isGrace:     status === "grace",
      };

      cache.set(schoolId, info);
      setState({ info, loading: false, error: null });
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || cache.has(schoolId)) return;
    fetch();
  }, [schoolId, fetch]);

  return { ...state, refetch: fetch };
}

/** Call this after a payment is recorded to bust the cache */
export function clearSubscriptionCache(schoolId: string) {
  cache.delete(schoolId);
}
