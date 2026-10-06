/**
 * SubscriptionGuard
 *
 * Wraps the main content area. If the school's subscription is "suspended",
 * renders a full-page block instead of the children.
 *
 * Integrated in DashboardLayout.tsx around the <main> tag.
 * Students, parents, super_admin, and outreach_officers bypass this guard.
 */
import type { ReactNode } from "react";
import { ShieldOff, CreditCard, Mail } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/lib/auth";

const BYPASS_ROLES = new Set(["super_admin", "outreach_officer", "student", "parent"]);

export default function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { isSuspended, isLoading } = useSubscription();

  // Never block non-school roles or while loading
  if (isLoading || !role || BYPASS_ROLES.has(role) || !isSuspended) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-6 ring-8 ring-red-100/50 dark:ring-red-900/20">
        <ShieldOff className="h-9 w-9 text-red-600 dark:text-red-400" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-2">Account Suspended</h1>
      <p className="text-muted-foreground max-w-sm text-sm mb-8 leading-relaxed">
        Access to your school's portal has been temporarily disabled due to an
        unpaid subscription. Please renew your plan to restore full access for
        all staff and students.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <a
          href="/admin/subscription"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <CreditCard className="h-4 w-4" />
          Renew Subscription
        </a>
        <a
          href="mailto:support@academiahq.com"
          className="inline-flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Mail className="h-4 w-4" />
          Contact Support
        </a>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        If this is a mistake, ask your platform administrator to review your subscription status.
      </p>
    </div>
  );
}
