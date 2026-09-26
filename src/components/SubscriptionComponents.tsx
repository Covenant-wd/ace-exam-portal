/**
 * Subscription UI Components
 *
 * SubscriptionBanner  — inline banner shown inside DashboardLayout
 *                       when status is grace or restricted
 *
 * SubscriptionGuard   — wraps a write action button/trigger and
 *                       blocks it when the school is restricted/suspended,
 *                       showing a toast instead of executing
 *
 * SuspendedScreen     — full-page block shown when status is suspended
 */

import { ReactNode } from "react";
import { AlertTriangle, XCircle, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SubscriptionInfo, SubscriptionStatus } from "@/hooks/useSubscription";

// ----------------------------------------------------------------
// SubscriptionBanner
// Shown at the top of the main content area (inside DashboardLayout)
// ----------------------------------------------------------------
interface BannerProps {
  info: SubscriptionInfo | null;
}

export function SubscriptionBanner({ info }: BannerProps) {
  if (!info || !info.showBanner) return null;

  if (info.isGrace) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-4 py-3 text-sm">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            Subscription expires soon
          </p>
          <p className="text-amber-700 dark:text-amber-400 mt-0.5">
            Your subscription expired {info.daysPastExpiry} day{info.daysPastExpiry !== 1 ? "s" : ""} ago.
            You have {7 - info.daysPastExpiry} day{7 - info.daysPastExpiry !== 1 ? "s" : ""} of grace access remaining.{" "}
            <a href="#renew" className="font-semibold underline underline-offset-2 hover:no-underline">
              Renew now to avoid restrictions.
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (info.isRestricted) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/20 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-red-800 dark:text-red-300">
            Your subscription has expired. Some features are disabled.
          </p>
          <p className="text-red-700 dark:text-red-400 mt-0.5">
            You can still view existing data, but creating exams, adding students, and publishing
            results is blocked until you renew.{" "}
            <a href="#renew" className="font-semibold underline underline-offset-2 hover:no-underline">
              Renew your subscription to restore full access.
            </a>
          </p>
        </div>
        <Button size="sm" className="shrink-0 bg-red-600 hover:bg-red-700 text-white border-0">
          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
          Pay Now
        </Button>
      </div>
    );
  }

  return null;
}

// ----------------------------------------------------------------
// SuspendedScreen
// Full replacement content when school is suspended
// ----------------------------------------------------------------
export function SuspendedScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
        <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Access Suspended</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        Access to this school has been temporarily disabled due to an unpaid subscription.
        Please contact your administrator or renew your subscription to restore access.
      </p>
      <Button size="lg" className="gap-2">
        <CreditCard className="h-4 w-4" />
        Pay Now to Restore Access
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">
        Need help? Contact support at support@academiahq.com
      </p>
    </div>
  );
}

// ----------------------------------------------------------------
// SubscriptionGuard
// Wraps any action element. When the school is restricted or
// suspended, clicking shows an informative toast instead.
//
// Usage:
//   <SubscriptionGuard info={subInfo} action="create">
//     <Button onClick={handleCreate}>Create Exam</Button>
//   </SubscriptionGuard>
// ----------------------------------------------------------------
type GuardAction = "create" | "publish" | "add_student" | "write";

const ACTION_MESSAGES: Record<GuardAction, string> = {
  create:      "Creating new content is disabled while your subscription is restricted. Please renew to continue.",
  publish:     "Publishing is disabled while your subscription is restricted. Please renew to continue.",
  add_student: "Adding students is disabled while your subscription is restricted. Please renew to continue.",
  write:       "This action is disabled while your subscription is restricted. Please renew to continue.",
};

interface GuardProps {
  children: ReactNode;
  info: SubscriptionInfo | null;
  action?: GuardAction;
  /** If true the guard is skipped even when restricted (for safe read-only actions) */
  bypass?: boolean;
}

export function SubscriptionGuard({ children, info, action = "write", bypass = false }: GuardProps) {
  if (bypass || !info || info.status === "active" || info.status === "grace") {
    return <>{children}</>;
  }

  const handleBlocked = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (info.isSuspended) {
      toast.error("Access suspended", {
        description: "Your school subscription has been suspended. Please contact support or renew.",
      });
    } else {
      toast.warning("Feature restricted", {
        description: ACTION_MESSAGES[action],
      });
    }
  };

  // Render children in a blocking wrapper
  return (
    <span
      onClick={handleBlocked}
      className="inline-block cursor-not-allowed select-none opacity-50"
      title={info.isSuspended ? "Access suspended" : "Subscription restricted"}
    >
      <span className="pointer-events-none">
        {children}
      </span>
    </span>
  );
}

// ----------------------------------------------------------------
// statusBadge — reusable badge for displaying subscription status
// ----------------------------------------------------------------
const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  active:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  grace:      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  restricted: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  suspended:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active:     "Active",
  grace:      "Grace Period",
  restricted: "Restricted",
  suspended:  "Suspended",
};

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border-0 ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
