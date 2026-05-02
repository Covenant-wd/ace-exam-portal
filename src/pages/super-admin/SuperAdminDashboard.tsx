import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { sendAdminWelcomeEmail } from "@/lib/email";
import {
  Loader2, Plus, School, Users, Copy, Trash2, Edit,
  ShieldCheck, ShieldX, ShieldAlert, TrendingUp, Calendar,
  CreditCard, AlertTriangle, CheckCircle2, Clock, RefreshCw,
} from "lucide-react";
import { StatusBadge } from "@/components/SubscriptionComponents";
import type { SubscriptionStatus, SubscriptionPlan } from "@/hooks/useSubscription";

interface SchoolItem {
  id:                string;
  name:              string;
  slug:              string;
  logo_url:          string | null;
  subscription_plan: string;
  stored_status:     string;
  computed_status:   string;
  expiry_date:       string | null;
  last_payment_date: string | null;
  last_amount_paid:  number;
  payment_reference: string | null;
  days_until_expiry: number | null;
  days_past_expiry:  number;
  student_count:     number;
  created_at:        string;
}

const PLAN_OPTIONS: SubscriptionPlan[] = ["trial", "basic", "standard", "premium"];
const STATUS_OPTIONS: SubscriptionStatus[] = ["active", "grace", "restricted", "suspended"];

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [schools,  setSchools]  = useState<SchoolItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [tab,      setTab]      = useState("all");

  // Create/edit school dialog
  const [schoolDialog,  setSchoolDialog]  = useState(false);
  const [editing,       setEditing]       = useState<SchoolItem | null>(null);
  const [name,          setName]          = useState("");
  const [slug,          setSlug]          = useState("");
  const [saving,        setSaving]        = useState(false);

  // Assign admin dialog
  const [assignDialog,    setAssignDialog]    = useState(false);
  const [assignSchoolId,  setAssignSchoolId]  = useState("");
  const [adminEmail,      setAdminEmail]      = useState("");
  const [adminPassword,   setAdminPassword]   = useState("");
  const [adminName,       setAdminName]       = useState("");
  const [assignSaving,    setAssignSaving]    = useState(false);

  // Subscription edit dialog
  const [subDialog,      setSubDialog]      = useState(false);
  const [subSchool,      setSubSchool]      = useState<SchoolItem | null>(null);
  const [subPlan,        setSubPlan]        = useState<SubscriptionPlan>("basic");
  const [subStatus,      setSubStatus]      = useState<SubscriptionStatus>("active");
  const [subExpiry,      setSubExpiry]      = useState("");
  const [subPayDate,     setSubPayDate]     = useState("");
  const [subAmount,      setSubAmount]      = useState("");
  const [subRef,         setSubRef]         = useState("");
  const [subNotes,       setSubNotes]       = useState("");
  const [subSaving,      setSubSaving]      = useState(false);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_all_schools_with_subscription");
    if (error) {
      // Fallback: query schools + count students via user_roles
      const { data: plain } = await supabase
        .from("schools")
        .select("*")
        .order("created_at", { ascending: false });

      // Count students per school from user_roles (role = 'student')
      const { data: roleCounts } = await supabase
        .from("user_roles")
        .select("school_id")
        .eq("role", "student");

      const countBySchool: Record<string, number> = {};
      (roleCounts || []).forEach((r: any) => {
        if (r.school_id) {
          countBySchool[r.school_id] = (countBySchool[r.school_id] ?? 0) + 1;
        }
      });

      setSchools((plain || []).map((s: any) => ({
        ...s,
        subscription_plan: s.subscription_plan ?? "trial",
        computed_status:   s.subscription_status ?? "active",
        stored_status:     s.subscription_status ?? "active",
        last_amount_paid:  s.last_amount_paid ?? 0,
        payment_reference: s.payment_reference ?? null,
        days_past_expiry:  0,
        student_count:     countBySchool[s.id] ?? 0,  // ← real count, not hardcoded 0
      })));
    } else {
      setSchools((data as SchoolItem[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  // ── Dashboard metrics ──────────────────────────────────────────
  const metrics = {
    total:      schools.length,
    active:     schools.filter(s => s.stored_status === "active").length,
    grace:      schools.filter(s => s.stored_status === "grace").length,
    restricted: schools.filter(s => s.stored_status === "restricted").length,
    suspended:  schools.filter(s => s.stored_status === "suspended").length,
    expiringSoon: schools.filter(s => s.days_until_expiry !== null && s.days_until_expiry >= 0 && s.days_until_expiry <= 14).length,
  };

  // ── Filter logic ───────────────────────────────────────────────
  const filtered = schools.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || s.stored_status === tab;
    return matchSearch && matchTab;
  });

  // ── School create/edit ─────────────────────────────────────────
  const generateSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const openNew = () => { setEditing(null); setName(""); setSlug(""); setSchoolDialog(true); };
  const openEdit = (s: SchoolItem) => { setEditing(s); setName(s.name); setSlug(s.slug); setSchoolDialog(true); };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { toast.error("Name and slug are required"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("schools").update({ name, slug }).eq("id", editing.id);
        if (error) throw error;
        toast.success("School updated");
      } else {
        const { error } = await supabase.from("schools").insert({ name, slug });
        if (error) throw error;
        const { data: newSchool } = await supabase.from("schools").select("id").eq("slug", slug).single();
        if (newSchool) {
          await supabase.from("school_settings").insert([
            { key: "school_name", value: name, school_id: newSchool.id },
            { key: "school_logo_url", value: "", school_id: newSchool.id },
          ]);
        }
        toast.success("School created");
      }
      setSchoolDialog(false); setName(""); setSlug(""); setEditing(null);
      fetchSchools();
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleDelete = async (school: SchoolItem) => {
    if (!confirm(`Delete "${school.name}"? This will remove all associated data.`)) return;
    const { error } = await supabase.from("schools").delete().eq("id", school.id);
    if (error) toast.error(error.message);
    else { toast.success("School deleted"); fetchSchools(); }
  };

  // ── Assign admin ───────────────────────────────────────────────
  const handleAssignAdmin = async () => {
    if (!adminEmail || !adminPassword || !adminName) { toast.error("All fields are required"); return; }
    setAssignSaving(true);
    try {
      const { data: newUserId, error } = await supabase.rpc("create_school_user", {
        _email: adminEmail.trim().toLowerCase(), _password: adminPassword,
        _full_name: adminName, _role: "admin", _school_id: assignSchoolId, _username: null,
      } as any);
      if (error) throw new Error(error.message);
      if (!newUserId) throw new Error("Failed to create admin account.");
      const school = schools.find(s => s.id === assignSchoolId);
      if (school) {
        sendAdminWelcomeEmail({
          to: adminEmail, adminName, schoolName: school.name,
          loginUrl: `${window.location.origin}/school/${school.slug}`,
          password: adminPassword,
        }).catch(() => {});
      }
      toast.success("School admin created successfully");
      setAssignDialog(false); setAdminEmail(""); setAdminPassword(""); setAdminName("");
    } catch (err: any) { toast.error(err.message); }
    setAssignSaving(false);
  };

  // ── Subscription management ────────────────────────────────────
  const openSubDialog = (school: SchoolItem) => {
    setSubSchool(school);
    setSubPlan((school.subscription_plan as SubscriptionPlan) ?? "trial");
    setSubStatus((school.stored_status as SubscriptionStatus) ?? "active");
    setSubExpiry(school.expiry_date ?? "");
    setSubPayDate(school.last_payment_date ?? "");
    setSubAmount("");
    setSubRef(school.payment_reference ?? "");
    setSubNotes("");
    setSubDialog(true);
  };

  const handleSaveSub = async () => {
    if (!subSchool || !subExpiry) { toast.error("Expiry date is required"); return; }
    setSubSaving(true);
    try {
      const { error } = await (supabase as any).rpc("update_school_subscription", {
        _school_id:         subSchool.id,
        _plan:              subPlan,
        _status:            String(subStatus),
        _expiry_date:       subExpiry,
        _last_payment_date: subPayDate || null,
        _amount_paid:       subAmount ? parseFloat(subAmount) : 0,
        _payment_reference: subRef || null,
        _notes:             subNotes || null,
      });
      if (error) throw error;
      toast.success(`Subscription updated for ${subSchool.name}`);
      setSubDialog(false);
      fetchSchools();
    } catch (err: any) { toast.error(err.message); }
    setSubSaving(false);
  };

  const quickStatus = async (school: SchoolItem, status: SubscriptionStatus) => {
    try {
      const { error } = await (supabase as any).rpc("update_school_subscription", {
        _school_id:   school.id,
        _plan:        school.subscription_plan,
        _status:      String(status),
        _expiry_date: school.expiry_date ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        _notes:       `Quick override to ${status} by super admin`,
      });
      if (error) throw error;
      toast.success(`${school.name} → ${status}`);
      fetchSchools();
    } catch (err: any) { toast.error(err.message); }
  };

  const copyLoginUrl = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/school/${slug}`);
    toast.success("Login URL copied!");
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB") : "—";

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schools</h1>
          <p className="text-muted-foreground text-sm">Manage all schools and subscriptions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchSchools}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add School
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total",       value: metrics.total,       icon: School,       color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600",       iconBg: "bg-blue-100 dark:bg-blue-900/40" },
          { label: "Active",      value: metrics.active,      icon: CheckCircle2, color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600", iconBg: "bg-emerald-100 dark:bg-emerald-900/40" },
          { label: "Grace",       value: metrics.grace,       icon: Clock,        color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600",     iconBg: "bg-amber-100 dark:bg-amber-900/40" },
          { label: "Restricted",  value: metrics.restricted,  icon: ShieldAlert,  color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600",  iconBg: "bg-orange-100 dark:bg-orange-900/40" },
          { label: "Suspended",   value: metrics.suspended,   icon: ShieldX,      color: "bg-red-50 dark:bg-red-900/20 text-red-600",           iconBg: "bg-red-100 dark:bg-red-900/40" },
          { label: "Exp. Soon",   value: metrics.expiringSoon, icon: AlertTriangle, color: "bg-purple-50 dark:bg-purple-900/20 text-purple-600", iconBg: "bg-purple-100 dark:bg-purple-900/40" },
        ].map(m => (
          <Card key={m.label} className="border-0 shadow-sm cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => setTab(m.label.toLowerCase().split(" ")[0])}>
            <CardContent className={`flex items-center gap-3 p-4 rounded-xl ${m.color}`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${m.iconBg}`}>
                <m.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-extrabold leading-none">{m.value}</p>
                <p className="text-xs opacity-70 mt-0.5">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search schools..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="grace">Grace</TabsTrigger>
            <TabsTrigger value="restricted">Restricted</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main schools table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead>Students</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No schools found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(school => {
                  const status = school.stored_status as SubscriptionStatus;
                  const rowClass = status === "suspended" ? "bg-red-50/30 dark:bg-red-950/10" :
                                   status === "restricted" ? "bg-orange-50/20 dark:bg-orange-950/10" :
                                   status === "grace" ? "bg-amber-50/20 dark:bg-amber-950/10" : "";
                  return (
                    <TableRow key={school.id} className={rowClass}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                            {school.logo_url
                              ? <img src={school.logo_url} alt="" className="h-full w-full object-contain" />
                              : <School className="h-4 w-4 text-primary" />
                            }
                          </div>
                          <div>
                            <p className="font-medium text-sm">{school.name}</p>
                            <p className="text-xs text-muted-foreground">{school.slug}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-sm font-medium">{school.subscription_plan}</span>
                        {school.last_amount_paid > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                            ₦{school.last_amount_paid.toLocaleString()}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={status} />
                        {school.days_until_expiry !== null && school.days_until_expiry >= 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">{school.days_until_expiry}d left</p>
                        )}
                        {school.days_past_expiry > 0 && (
                          <p className="text-xs text-red-500 mt-0.5">{school.days_past_expiry}d overdue</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(school.expiry_date)}</TableCell>
                      <TableCell className="text-sm">{formatDate(school.last_payment_date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {school.student_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openSubDialog(school)}>
                            <CreditCard className="h-3 w-3" /> Subscription
                          </Button>
                          {status !== "active" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => quickStatus(school, "active")}>
                              <ShieldCheck className="h-3 w-3 mr-1" /> Activate
                            </Button>
                          )}
                          {status !== "suspended" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => quickStatus(school, "suspended")}>
                              <ShieldX className="h-3 w-3 mr-1" /> Suspend
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setAssignSchoolId(school.id); setAssignDialog(true); }}>
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLoginUrl(school.slug)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(school)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(school)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Create/Edit School ── */}
      <Dialog open={schoolDialog} onOpenChange={setSchoolDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit School" : "Create School"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>School Name</Label>
              <Input value={name} onChange={e => { setName(e.target.value); if (!editing) setSlug(generateSlug(e.target.value)); }} placeholder="ABC Academy" />
            </div>
            <div className="space-y-2">
              <Label>URL Slug</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="abc-academy" />
              <p className="text-xs text-muted-foreground">Login URL: {window.location.origin}/school/{slug || "..."}</p>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Create School"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Admin ── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign School Admin</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {["Full Name", "Email", "Password"].map((label, i) => (
              <div key={label} className="space-y-2">
                <Label>{label}</Label>
                <Input
                  type={i === 2 ? "password" : i === 1 ? "email" : "text"}
                  value={i === 0 ? adminName : i === 1 ? adminEmail : adminPassword}
                  onChange={e => [setAdminName, setAdminEmail, setAdminPassword][i](e.target.value)}
                  placeholder={["Admin Name", "admin@school.com", "••••••••"][i]}
                  minLength={i === 2 ? 6 : undefined}
                />
              </div>
            ))}
            <Button onClick={handleAssignAdmin} disabled={assignSaving} className="w-full">
              {assignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Admin Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Subscription Management ── */}
      <Dialog open={subDialog} onOpenChange={setSubDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {subSchool?.name} — Subscription
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={subPlan} onValueChange={v => setSubPlan(v as SubscriptionPlan)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map(p => (
                      <SelectItem key={p} value={p}>
                        <span className="capitalize">{p}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status Override</Label>
                <Select value={subStatus} onValueChange={v => setSubStatus(v as SubscriptionStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payment amount — manually entered by super admin */}
            <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10 p-3 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Payment Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount Paid (₦)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      value={subAmount}
                      onChange={e => setSubAmount(e.target.value)}
                      placeholder="0"
                      className="pl-7"
                    />
                  </div>
                  {subSchool?.last_amount_paid > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Last: ₦{subSchool.last_amount_paid.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Reference</Label>
                  <Input
                    value={subRef}
                    onChange={e => setSubRef(e.target.value)}
                    placeholder="e.g. TRF-2025-001"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Date</Label>
                <Input type="date" value={subPayDate} onChange={e => setSubPayDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label>Expiry Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={subExpiry} onChange={e => setSubExpiry(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={subNotes} onChange={e => setSubNotes(e.target.value)} placeholder="e.g. Annual renewal, bank transfer" />
            </div>
            {/* Show computed vs override status */}
            {subExpiry && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Status Preview</p>
                {(() => {
                  const today   = new Date(); today.setHours(0,0,0,0);
                  const expiry  = new Date(subExpiry); expiry.setHours(0,0,0,0);
                  const diff    = Math.floor((today.getTime() - expiry.getTime()) / 86400000);
                  const computed = diff <= 0 ? "active" : diff <= 7 ? "grace" : diff <= 14 ? "restricted" : "suspended";
                  const isOverride = subStatus !== computed;
                  return (
                    <>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Date-computed:</span>{" "}
                        <span className="capitalize">{computed}</span>
                        {diff > 0 ? ` (${diff}d past expiry)` : diff === 0 ? " (expires today)" : ` (${Math.abs(diff)}d remaining)`}
                      </p>
                      {isOverride && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                          ⚠ You are manually overriding the status to "{subStatus}".
                          This override will remain until you change it again.
                        </p>
                      )}
                      {!isOverride && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          ✓ Status matches date computation — no override active.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            <Button onClick={handleSaveSub} disabled={subSaving} className="w-full">
              {subSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Subscription"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
