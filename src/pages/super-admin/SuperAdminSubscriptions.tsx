/**
 * SuperAdminSubscriptions — Payment History & Audit Log
 *
 * This page is the AUDIT TRAIL for all subscription changes.
 * The actual subscription management (update plan, override status)
 * lives in SuperAdminDashboard where the school table is.
 *
 * Avoids duplication. Clear division of responsibility:
 *   SuperAdminDashboard    → manage schools + subscriptions
 *   SuperAdminSubscriptions → view full payment history + revenue
 */
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, TrendingUp, DollarSign, Receipt, Clock, AlertTriangle, CheckCircle2, ShieldOff } from "lucide-react";
import { StatusBadge } from "@/components/SubscriptionComponents";
import type { SubscriptionStatus } from "@/hooks/useSubscription";

interface HistoryRow {
  id:                string;
  school_name:       string;
  school_slug:       string;
  plan:              string;
  status:            SubscriptionStatus;
  amount_paid:       number;
  payment_reference: string | null;
  payment_date:      string;
  expiry_date:       string;
  notes:             string | null;
  created_at:        string;
}

interface SummaryRow {
  id:                  string;
  name:                string;
  slug:                string;
  subscription_plan:   string;
  subscription_status: SubscriptionStatus;
  expiry_date:         string | null;
  last_payment_date:   string | null;
  days_until_expiry:   number | null;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SuperAdminSubscriptions() {
  const [history,  setHistory]  = useState<HistoryRow[]>([]);
  const [summary,  setSummary]  = useState<SummaryRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      // Payment history — join with schools
      const { data: hist, error: hErr } = await supabase
        .from("subscriptions")
        .select(`
          id, plan, status, amount_paid, payment_reference,
          payment_date, expiry_date, notes, created_at,
          schools!inner(name, slug)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (hErr) throw hErr;

      setHistory(
        (hist ?? []).map((r: any) => ({
          id:                r.id,
          school_name:       r.schools?.name ?? "—",
          school_slug:       r.schools?.slug ?? "—",
          plan:              r.plan,
          status:            r.status,
          amount_paid:       Number(r.amount_paid) || 0,
          payment_reference: r.payment_reference,
          payment_date:      r.payment_date,
          expiry_date:       r.expiry_date,
          notes:             r.notes,
          created_at:        r.created_at,
        }))
      );

      // School subscription summary (for KPIs + expiry warnings)
      const { data: schools } = await supabase
        .from("schools")
        .select("id, name, slug, subscription_plan, subscription_status, expiry_date, last_payment_date");

      setSummary(
        (schools ?? []).map((s: any) => ({
          id:                  s.id,
          name:                s.name,
          slug:                s.slug,
          subscription_plan:   s.subscription_plan   ?? "basic",
          subscription_status: s.subscription_status ?? "active",
          expiry_date:         s.expiry_date         ?? null,
          last_payment_date:   s.last_payment_date   ?? null,
          days_until_expiry:   s.expiry_date
            ? Math.floor((new Date(s.expiry_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000)
            : null,
        }))
      );
    } catch (err: any) {
      toast.error("Failed to load history: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRevenue = history.reduce((n, r) => n + r.amount_paid, 0);
    const thisMonth = history.filter(r => {
      const d = new Date(r.payment_date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthRevenue = thisMonth.reduce((n, r) => n + r.amount_paid, 0);

    return {
      totalRevenue,
      monthRevenue,
      totalPayments:   history.filter(r => r.amount_paid > 0).length,
      expiringSoon:    summary.filter(s => s.days_until_expiry !== null && s.days_until_expiry >= 0 && s.days_until_expiry <= 14).length,
      overdue:         summary.filter(s => s.subscription_status === "restricted" || s.subscription_status === "suspended").length,
    };
  }, [history, summary]);

  // ── Filtered history ──────────────────────────────────────────────
  const filtered = useMemo(() => history.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.school_name.toLowerCase().includes(q) ||
      (r.payment_reference ?? "").toLowerCase().includes(q);
    const matchFilter = filter === "all" || r.status === filter;
    return matchSearch && matchFilter;
  }), [history, search, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment History</h1>
          <p className="text-muted-foreground text-sm">
            Full audit log of all subscription payments and changes.{" "}
            <span className="font-medium">To update a school's subscription, go to the Schools page.</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Revenue",    value: `₦${kpis.totalRevenue.toLocaleString()}`,  icon: DollarSign,    color: "text-emerald-600 dark:text-emerald-400" },
          { label: "This Month",       value: `₦${kpis.monthRevenue.toLocaleString()}`,  icon: TrendingUp,    color: "text-blue-600 dark:text-blue-400" },
          { label: "Total Payments",   value: kpis.totalPayments,                         icon: Receipt,       color: "text-indigo-600 dark:text-indigo-400" },
          { label: "Expiring in 14d",  value: kpis.expiringSoon,                          icon: Clock,         color: "text-amber-600 dark:text-amber-400" },
          { label: "Overdue",          value: kpis.overdue,                               icon: AlertTriangle, color: "text-red-600 dark:text-red-400" },
        ].map(c => (
          <Card key={c.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`h-4 w-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className={`text-2xl font-bold leading-none ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expiry Warnings — schools needing attention */}
      {summary.filter(s => ["restricted","suspended"].includes(s.subscription_status)).length > 0 && (
        <Card className="border-red-200 dark:border-red-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
              <ShieldOff className="h-4 w-4" />
              Schools Needing Immediate Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Last Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary
                  .filter(s => s.subscription_status === "restricted" || s.subscription_status === "suspended")
                  .map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.name}</TableCell>
                      <TableCell><StatusBadge status={s.subscription_status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(s.expiry_date)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(s.last_payment_date)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by school or reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="grace">Grace</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <p className="self-center text-xs text-muted-foreground ml-auto">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Payment History Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>School</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status at Time</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Expiry Set To</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-28 text-center text-muted-foreground text-sm">
                    No payment records found.
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{r.school_name}</p>
                    <p className="text-xs text-muted-foreground">{r.school_slug}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize text-xs">{r.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(r.payment_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(r.expiry_date)}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {r.amount_paid > 0
                      ? <span className="text-emerald-700 dark:text-emerald-400">₦{r.amount_paid.toLocaleString()}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.payment_reference ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

    </div>
  );
}
