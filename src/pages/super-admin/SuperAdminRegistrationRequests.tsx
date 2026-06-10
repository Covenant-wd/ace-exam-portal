import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  School,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  RefreshCw,
  Eye,
  Search,
  CalendarDays,
  AlertCircle,
} from "lucide-react";

interface RegistrationRequest {
  id: string;
  email: string;
  school_name: string;
  contact_person: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  pending:  { label: "Pending",  variant: "secondary" as const, icon: Clock,         className: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-900/40" },
  approved: { label: "Approved", variant: "default"   as const, icon: CheckCircle2,  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40" },
  rejected: { label: "Rejected", variant: "destructive" as const, icon: XCircle,     className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/40" },
};

function StatusBadge({ status }: { status: RegistrationRequest["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SuperAdminRegistrationRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");

  // Detail / approve dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<RegistrationRequest | null>(null);

  // Approve dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<RegistrationRequest | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [approveSaving, setApproveSaving] = useState(false);

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RegistrationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("school_registration_requests")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) {
      toast.error("Failed to load registration requests");
      console.error(error);
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = {
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = requests.filter(r => {
    const matchesTab = tab === "all" || r.status === tab;
    const q = search.toLowerCase();
    const matchesSearch = !q || [r.school_name, r.email, r.contact_person].some(f =>
      (f || "").toLowerCase().includes(q)
    );
    return matchesTab && matchesSearch;
  });

  // ── Approve flow ──────────────────────────────────────────────────────────
  function openApprove(req: RegistrationRequest) {
    setApproveTarget(req);
    setAdminEmail(req.email);
    setAdminName(req.contact_person);
    setAdminPassword("");
    setApproveOpen(true);
  }

  async function handleApprove() {
    if (!approveTarget || !user) return;
    if (!adminEmail.trim() || !adminPassword.trim() || !adminName.trim()) {
      toast.error("Please fill in all admin credential fields");
      return;
    }
    if (adminPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setApproveSaving(true);
    try {
      // 1. Call the DB function to approve (creates school, updates request)
      const { data: approvalResult, error: approvalError } = await (supabase as any)
        .rpc("approve_school_registration", {
          _req_id: approveTarget.id,
          _reviewed_by: user.id,
        });

      if (approvalError) throw approvalError;

      const schoolId = approvalResult?.[0]?.school_id;
      if (!schoolId) throw new Error("School ID not returned from approval function");

      // 2. Create auth user for the admin
      const { data: authData, error: authError } = await supabase.auth.admin
        ? // Service-role path (if available in edge function context)
          { data: null, error: new Error("Use edge function") }
        : { data: null, error: new Error("Use edge function") };

      // 3. Use the edge function for admin user creation (same pattern as SuperAdminDashboard)
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-school-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            email: adminEmail.trim(),
            password: adminPassword.trim(),
            name: adminName.trim(),
            school_id: schoolId,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create admin user");

      toast.success(`✅ ${approveTarget.school_name} approved and admin account created!`);
      setApproveOpen(false);
      setApproveTarget(null);
      fetchRequests();
    } catch (err: any) {
      console.error("Approve error:", err);
      toast.error(err.message || "Approval failed. Please try again.");
    } finally {
      setApproveSaving(false);
    }
  }

  // ── Reject flow ───────────────────────────────────────────────────────────
  function openReject(req: RegistrationRequest) {
    setRejectTarget(req);
    setRejectReason("");
    setRejectOpen(true);
  }

  async function handleReject() {
    if (!rejectTarget || !user) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    setRejectSaving(true);
    try {
      const { error } = await (supabase as any).rpc("reject_school_registration", {
        _req_id: rejectTarget.id,
        _reviewed_by: user.id,
        _rejection_reason: rejectReason.trim(),
      });

      if (error) throw error;

      toast.success(`Registration for ${rejectTarget.school_name} has been rejected.`);
      setRejectOpen(false);
      setRejectTarget(null);
      fetchRequests();
    } catch (err: any) {
      console.error("Reject error:", err);
      toast.error(err.message || "Failed to reject request. Please try again.");
    } finally {
      setRejectSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registration Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve school registration applications
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-amber-200 dark:border-amber-900/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/20">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.pending}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 dark:border-emerald-900/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.rejected}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs + Search + Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="pending">
                  Pending
                  {counts.pending > 0 && (
                    <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {counts.pending}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search school or contact…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <School className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">
                {search ? "No matching requests found" : `No ${tab === "all" ? "" : tab} requests`}
              </p>
              {search && (
                <Button variant="link" size="sm" className="mt-1" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden lg:table-cell">Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <School className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm leading-tight">{req.school_name}</p>
                            {req.address && (
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{req.address}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm">{req.contact_person}</p>
                        {req.phone && <p className="text-xs text-muted-foreground">{req.phone}</p>}
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">
                        <p className="text-sm">{req.email}</p>
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={req.status} />
                        {req.status === "rejected" && req.rejection_reason && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-1 max-w-[140px]">
                            {req.rejection_reason}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(req.requested_at)}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelected(req); setDetailOpen(true); }}
                            className="h-8 w-8 p-0"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {req.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                                onClick={() => openApprove(req)}
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                                onClick={() => openReject(req)}
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <School className="h-5 w-5 text-primary" />
              Registration Details
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{selected.school_name}</h3>
                <StatusBadge status={selected.status} />
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-4">
                <DetailRow icon={User}     label="Contact Person" value={selected.contact_person} />
                <DetailRow icon={Mail}     label="Email"          value={selected.email} />
                {selected.phone   && <DetailRow icon={Phone}   label="Phone"   value={selected.phone} />}
                {selected.address && <DetailRow icon={MapPin}  label="Address" value={selected.address} />}
                {selected.website && <DetailRow icon={Globe}   label="Website" value={selected.website} isLink />}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Submitted</p>
                  <p className="font-medium">{formatDate(selected.requested_at)}</p>
                </div>
                {selected.reviewed_at && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Reviewed</p>
                    <p className="font-medium">{formatDate(selected.reviewed_at)}</p>
                  </div>
                )}
              </div>

              {selected.rejection_reason && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-600 dark:text-red-300">{selected.rejection_reason}</p>
                </div>
              )}

              {selected.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => { setDetailOpen(false); openApprove(selected); }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => { setDetailOpen(false); openReject(selected); }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve Dialog ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Approve Registration
            </DialogTitle>
            <DialogDescription>
              Approving <strong>{approveTarget?.school_name}</strong> will create the school and an admin account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 p-3 text-sm text-blue-700 dark:text-blue-400 flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Set the admin login credentials for this school. The admin will use these to sign in.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="approve-name">Admin Name <span className="text-destructive">*</span></Label>
              <Input
                id="approve-name"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="approve-email">Admin Email <span className="text-destructive">*</span></Label>
              <Input
                id="approve-email"
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="admin@school.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="approve-password">
                Admin Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="approve-password"
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Share these credentials with the school admin securely.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={approveSaving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApprove}
              disabled={approveSaving}
            >
              {approveSaving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving…</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" />Approve & Create Admin</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Registration
            </DialogTitle>
            <DialogDescription>
              Rejecting <strong>{rejectTarget?.school_name}</strong>. Please provide a clear reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <Label htmlFor="reject-reason">
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete information provided. Please resubmit with a valid school address and phone number."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be stored and can be viewed later.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejectSaving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectSaving || !rejectReason.trim()}
            >
              {rejectSaving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejecting…</>
              ) : (
                <><XCircle className="mr-2 h-4 w-4" />Confirm Rejection</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Small helper component ────────────────────────────────────────────────────
function DetailRow({
  icon: Icon,
  label,
  value,
  isLink,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLink ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm font-medium">{value}</p>
        )}
      </div>
    </div>
  );
}
