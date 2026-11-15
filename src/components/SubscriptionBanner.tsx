/**
 * SubscriptionBanner
 *
 * Renders a contextual alert based on the school's subscription status.
 * Renders nothing when status is "active".
 *
 * Placed inside DashboardLayout's <main> area so every admin/instructor
 * page gets it automatically — no per-page code needed.
 */
import { Clock, AlertTriangle, XCircle, CreditCard } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export default function SubscriptionBanner() {
  const { status, subscription } = useSubscription();
  if (status === "active") return null;

  const expiryFmt = subscription?.expiryDate
    ? new Date(subscription.expiryDate).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  const daysAbs = subscription?.daysUntilExpiry != null
    ? Math.abs(subscription.daysUntilExpiry)
    : null;

  if (status === "grace") {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700/60 dark:bg-amber-900/20">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Subscription expiring soon
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-0.5">
            {expiryFmt
              ? `Your subscription expired on ${expiryFmt} — you have ${daysAbs} grace day(s) left.`
              : "Your subscription has recently expired."}{" "}
            Renew now to avoid losing access.
          </p>
        </div>
        <a
          href="/admin/subscription"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Renew
        </a>
      </div>
    );
  }

  if (status === "restricted") {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-700/60 dark:bg-orange-900/20">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-300">
            Subscription expired — restricted access
          </p>
          <p className="text-xs text-orange-800/80 dark:text-orange-400/80 mt-0.5">
            Your subscription has expired. You can view existing data, but{" "}
            <strong>creating exams, adding students, and publishing results are disabled</strong>.
            Renew to restore full access.
          </p>
        </div>
        <a
          href="/admin/subscription"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Renew Now
        </a>
      </div>
    );
  }

  // suspended — shown briefly before SubscriptionGuard takes over
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-700/60 dark:bg-red-900/20">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-900 dark:text-red-300">
          Account suspended
        </p>
        <p className="text-xs text-red-800/80 dark:text-red-400/80 mt-0.5">
          Access has been temporarily disabled due to an unpaid subscription.
          Please pay your outstanding balance to restore access.
        </p>
      </div>
      <a
        href="/admin/subscription"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
      >
        <CreditCard className="h-3.5 w-3.5" />
        Pay Now
      </a>
    </div>
  );
}
