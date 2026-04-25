import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, School, CheckCircle2, AlertTriangle, ShieldOff, Clock,
  Edit2, ShieldCheck, History, RefreshCw, DollarSign, CreditCard,
} from "lucide-react";
import { computeStatus } from "@/hooks/useSubscription";
import type { SubscriptionStatus } from "@/hooks/useSubscription";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  subscription_status: SubscriptionStatus;
  expiry_date: string | null;
  last_payment_date: string | null;
  monthly_fee: number;
  created_at: string;
}

interface HistoryRow {
  id: string;
  plan: string;
  status: string;
  amount_paid: number;
  payment_reference: string | null;
  payment_date: string;
  expiry_date: string;
  notes: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLANS = ["basic", "standard", "premium", "enterprise"];

const STATUS_CONFIG: Record<SubscriptionStatus, {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
}> = {
  active:     { label: "Active",      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700",  icon: <CheckCircle2 className="h-3 w-3" /> },
  grace:      { label: "Grace",       badgeClass: "bg-amber-100   text-amber-800   border-amber-200   dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-700",    icon: <Clock        className="h-3 w-3" /> },
  restricted: { label: "Restricted",  badgeClass: "bg-orange-100  text-orange-800  border-orange-200  dark:bg-orange-900/30  dark:text-orange-400  dark:border-orange-700",  icon: <AlertTriangle className="h-3 w-3" /> },
  suspended:  { label: "Suspended",   badgeClass: "bg-red-100     text-red-800     border-red-200     dark:bg-red-900/30     dark:text-red-400     dark:border-red-700",     icon: <ShieldOff     className="h-3 w-3" /> },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysChip(expiryDate: string | null, status: SubscriptionStatus) {
  if (!expiryDate) return null;
  const diff = Math.floor((new Date(expiryDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000);
  const abs = Math.abs(diff);
  const label = diff >= 0 ? `${diff}d left` : diff === 0 ? "Today" : `${abs}d ago`;
  const cls =
    status === "suspended"  ? "text-red-600 dark:text-red-400 font-semibold" :
    status === "restricted" ? "text-orange-600 dark:text-orange-400 font-semibold" :
    status === "grace"      ? "text-amber-600 dark:text-amber-400 font-semibold" :
                              "text-emerald-600 dark:text-emerald-400";
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SuperAdminSubscriptions() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SchoolRow | null>(null);
  const [editPlan, setEditPlan] = useState("basic");
  const [editExpiry, setEditExpiry] = useState("");
  const [editAmount, setEditAmount] = useState("0");
  const [editRef, setEditRef] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Override dialog
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<SchoolRow | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<SubscriptionStatus>("active");
  const [overrideSaving, setOverrideSaving] = useState(false);

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<SchoolRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const fetchSchools = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("schools")
      .select("id, name, slug, subscription_plan, subscription_status, expiry_date, last_payment_date, monthly_fee, created_at")
      .order("name");

    if (error) { toast.error("Failed to load schools"); setLoading(false); return; }

    const rows: SchoolRow[] = (data ?? []).map((s: any) => ({
      id:                  s.id,
      name:                s.name,
      slug:                s.slug,
      subscription_plan:   s.subscription_plan  ?? "basic",
      // Always recompute client-side so stale DB values don't show wrong state
      subscription_status: computeStatus(s.expiry_date),
      expiry_date:         s.expiry_date         ?? null,
      last_payment_date:   s.last_payment_date   ?? null,
      monthly_fee:         Number(s.monthly_fee) || 0,
      created_at:          s.created_at,
    }));

    setSchools(rows);
    setLoading(false);
  };

  useEffect(() => { fetchSchools(); }, []);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:      schools.length,
    active:     schools.filter(s => s.subscription_status === "active").length,
    grace:      schools.filter(s => s.subscription_status === "grace").length,
    restricted: schools.filter(s => s.subscription_status === "restricted").length,
    suspended:  schools.filter(s => s.subscription_status === "suspended").length,
    revenue:    schools.reduce((n, s) => n + s.monthly_fee, 0),
  }), [schools]);

  // ── Filtered rows ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => schools.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || s.subscription_status === filterStatus;
    return matchSearch && matchStatus;
  }), [schools, search, filterStatus]);

  // ── Edit subscription ───────────────────────────────────────────────────────
  const openEdit = (s: SchoolRow) => {
    setEditTarget(s);
    setEditPlan(s.subscription_plan);
    setEditExpiry(s.expiry_date ?? "");
    setEditAmount("0");
    setEditRef("");
    setEditNotes("");
    setEditOpen(true);
  };

  const handleSaveSubscription = async () => {
    if (!editTarget || !editExpiry) { toast.error("Expiry date is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_school_subscription" as any, {
        _school_id:         editTarget.id,
        _plan:              editPlan,
        _expiry_date:       editExpiry,
        _amount_paid:       parseFloat(editAmount) || 0,
        _payment_reference: editRef   || null,
        _notes:             editNotes || null,
      });
      if (error) throw error;
      toast.success(`Subscription updated for ${editTarget.name}`);
      setEditOpen(false);
      fetchSchools();
    } catch (err: any) {
      toast.error(err.message ?? "Update failed");
    }
    setSaving(false);
  };

  // ── Override status ─────────────────────────────────────────────────────────
  const openOverride = (s: SchoolRow) => {
    setOverrideTarget(s);
    setOverrideStatus(s.subscription_status);
    setOverrideOpen(true);
  };

  const handleOverride = async () => {
    if (!overrideTarget) return;
    setOverrideSaving(true);
    try {
      const { error } = await supabase.rpc("override_school_subscription_status" as any, {
        _school_id: overrideTarget.id,
        _status:    overrideStatus,
      });
      if (error) throw error;
      toast.success(`Status overridden → "${overrideStatus}"`);
      setOverrideOpen(false);
      fetchSchools();
    } catch (err: any) {
      toast.error(err.message ?? "Override failed");
    }
    setOverrideSaving(false);
  };

  // ── History ─────────────────────────────────────────────────────────────────
  const openHistory = async (s: SchoolRow) => {
    setHistoryTarget(s);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("id, plan, status, amount_paid, payment_reference, payment_date, expiry_date, notes, created_at")
      .eq("school_id", s.id)
      .order("created_at", { ascending: false })
      .limit(25);
    setHistory((data as HistoryRow[]) ?? []);
    setHistoryLoading(false);
  };

  // ── Quick activate (1 year from today) ─────────────────────────────────────
  const quickActivate = async (s: SchoolRow) => {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryStr = expiry.toISOString().split("T")[0];
    try {
      const { error } = await supabase.rpc("update_school_subscription" as any, {
        _school_id: s.id, _plan: s.subscription_plan,
        _expiry_date: expiryStr, _amount_paid: 0,
        _notes: "Quick-activated by super admin (1 year)",
      });
      if (error) throw error;
      toast.success(`${s.name} activated for 1 year`);
      fetchSchools();
    } catch (err: any) { toast.error(err.message); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor and manage every school's plan status</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSchools}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Total",      value: kpis.total,      icon: <School        className="h-4 w-4 text-muted-foreground" />, cls: "" },
          { label: "Active",     value: kpis.active,     icon: <CheckCircle2  className="h-4 w-4 text-emerald-500" />,      cls: "text-emerald-600 dark:text-emerald-400" },
          { label: "Grace",      value: kpis.grace,      icon: <Clock         className="h-4 w-4 text-amber-500" />,        cls: "text-amber-600   dark:text-amber-400" },
          { label: "Restricted", value: kpis.restricted, icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,       cls: "text-orange-600  dark:text-orange-400" },
          { label: "Suspended",  value: kpis.suspended,  icon: <ShieldOff     className="h-4 w-4 text-red-500" />,          cls: "text-red-600     dark:text-red-400" },
          { label: "Est. Rev.",  value: `₦${kpis.revenue.toLocaleString()}`, icon: <DollarSign className="h-4 w-4 text-blue-500" />, cls: "text-blue-600 dark:text-blue-400 text-base" },
        ].map(card => (
          <Card key={card.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">{card.icon}<span className="text-xs text-muted-foreground">{card.label}</span></div>
              <p className={`text-2xl font-bold leading-none ${card.cls}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by school name or slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="grace">Grace period</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <p className="self-center text-xs text-muted-foreground ml-auto">
          Showing {filtered.length} of {schools.length} schools
        </p>
      </div>

      {/* ── Main Table ── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="font-semibold">School</TableHead>
                <TableHead className="font-semibold">Plan</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Expiry Date</TableHead>
                <TableHead className="font-semibold">Time</TableHead>
                <TableHead className="font-semibold">Last Payment</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-sm">
                    No schools match your filters.
                  </TableCell>
                </TableRow>
              ) : filtered.map(s => (
                <TableRow key={s.id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-semibold text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize text-xs">{s.subscription_plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.subscription_status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(s.expiry_date)}</TableCell>
                  <TableCell>{daysChip(s.expiry_date, s.subscription_status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(s.last_payment_date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      {/* Edit subscription */}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Edit subscription">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {/* Override status */}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openOverride(s)} title="Override status">
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </Button>
                      {/* History */}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openHistory(s)} title="Payment history">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      {/* Quick activate — only shown when degraded */}
                      {(s.subscription_status === "restricted" || s.subscription_status === "suspended") && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          onClick={() => quickActivate(s)} title="Quick activate (1 year)"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ════════════════ EDIT SUBSCRIPTION DIALOG ════════════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Update Subscription
            </DialogTitle>
            {editTarget && <p className="text-sm text-muted-foreground pt-0.5">{editTarget.name}</p>}
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Plan */}
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={editPlan} onValueChange={setEditPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANS.map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expiry date */}
            <div className="space-y-1.5">
              <Label>New Expiry Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} />
              {editExpiry && (
                <p className="text-xs text-muted-foreground">
                  Computed status after save:{" "}
                  <strong className="capitalize text-foreground">{computeStatus(editExpiry)}</strong>
                </p>
              )}
            </div>

            {/* Payment fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount Paid (₦)</Label>
                <Input type="number" min="0" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Reference</Label>
                <Input value={editRef} onChange={e => setEditRef(e.target.value)} placeholder="TXN-123456" />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="e.g. Annual renewal, bank transfer" />
            </div>

            <Button onClick={handleSaveSubscription} disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Save Subscription
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════ OVERRIDE STATUS DIALOG ════════════════ */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Override Status
            </DialogTitle>
            {overrideTarget && <p className="text-sm text-muted-foreground pt-0.5">{overrideTarget.name}</p>}
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Manually set the subscription status without changing the expiry date.
              Useful for temporary access grants or emergency lockouts.
            </p>
            <div className="space-y-1.5">
              <Label>New Status</Label>
              <Select value={overrideStatus} onValueChange={v => setOverrideStatus(v as SubscriptionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["active", "grace", "restricted", "suspended"] as SubscriptionStatus[]).map(s => (
                    <SelectItem key={s} value={s}>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={s} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleOverride} disabled={overrideSaving} className="w-full">
              {overrideSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Apply Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════ HISTORY DIALOG ════════════════ */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Subscription History
            </DialogTitle>
            {historyTarget && <p className="text-sm text-muted-foreground pt-0.5">{historyTarget.name}</p>}
          </DialogHeader>

          {historyLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payment history recorded yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">{fmt(h.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">{h.plan}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={h.status as SubscriptionStatus} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmt(h.expiry_date)}</TableCell>
                      <TableCell className="text-sm">
                        {h.amount_paid > 0 ? `₦${Number(h.amount_paid).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.payment_reference ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
