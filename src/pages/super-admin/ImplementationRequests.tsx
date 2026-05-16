import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2, Search, Trash2, Eye, Building2, User, Phone, Mail,
  GraduationCap, Users, MapPin, MessageSquare, CalendarCheck,
  RefreshCw, CheckCircle2, Clock, PhoneCall, Zap, ClipboardList,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "New" | "Contacted" | "In Progress" | "Completed";

interface ImplRequest {
  id: string;
  school_name: string;
  contact_name: string;
  phone: string;
  email: string;
  school_type: string;
  student_count: string;
  location: string;
  services_needed: string[];
  message: string | null;
  book_visit: boolean;
  status: Status;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES: Status[] = ["New", "Contacted", "In Progress", "Completed"];

const STATUS_CONFIG: Record<Status, { color: string; icon: React.ElementType; bg: string }> = {
  "New":         { color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",    icon: Zap          },
  "Contacted":   { color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",  icon: PhoneCall    },
  "In Progress": { color: "text-violet-700",  bg: "bg-violet-50 border-violet-200",icon: Clock        },
  "Completed":   { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",icon: CheckCircle2},
};

const SENTINEL_ALL = "__ALL__";

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, status }: { label: string; value: number; status: Status }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Card className={`border ${cfg.bg}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cfg.bg} border ${cfg.bg.replace("bg-", "border-")}`}>
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-slate-800">{value}</p>
          <p className={`text-xs font-semibold ${cfg.color}`}>{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImplementationRequests() {
  const [requests,   setRequests]   = useState<ImplRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState<string>(SENTINEL_ALL);

  // Detail dialog
  const [selected,   setSelected]   = useState<ImplRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Delete confirm
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("implementation_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setRequests((data as ImplRequest[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return requests.filter(r => {
      const matchSearch =
        !q ||
        r.school_name.toLowerCase().includes(q)  ||
        r.contact_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)        ||
        r.location.toLowerCase().includes(q);
      const matchStatus =
        filterStatus === SENTINEL_ALL || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [requests, search, filterStatus]);

  // ── Counts ────────────────────────────────────────────────────────────────

  const counts = useMemo(() =>
    STATUSES.reduce((acc, s) => {
      acc[s] = requests.filter(r => r.status === s).length;
      return acc;
    }, {} as Record<Status, number>),
  [requests]);

  // ── Status update ─────────────────────────────────────────────────────────

  const updateStatus = async (id: string, status: Status) => {
    setUpdatingId(id);
    const { error } = await supabase
      .from("implementation_requests")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
      toast.success(`Status updated to "${status}"`);
    }
    setUpdatingId(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase
      .from("implementation_requests")
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error(error.message);
    } else {
      setRequests(prev => prev.filter(r => r.id !== deleteId));
      toast.success("Request deleted.");
      if (selected?.id === deleteId) setDetailOpen(false);
    }
    setDeleteId(null);
    setDeleting(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openDetail = (r: ImplRequest) => { setSelected(r); setDetailOpen(true); };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("en-NG", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Implementation Requests</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            Manage all school onboarding and demo requests.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map(s => (
          <StatCard key={s} label={s} value={counts[s] ?? 0} status={s} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search by school, contact, email, location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] rounded-xl">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_ALL}>All Statuses</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-semibold">No requests found</p>
            <p className="text-xs mt-1">
              {search || filterStatus !== SENTINEL_ALL ? "Try adjusting your filters." : "Requests submitted from the homepage will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-bold text-slate-600">School</TableHead>
                  <TableHead className="font-bold text-slate-600">Contact</TableHead>
                  <TableHead className="font-bold text-slate-600">Services</TableHead>
                  <TableHead className="font-bold text-slate-600">Location</TableHead>
                  <TableHead className="font-bold text-slate-600">Status</TableHead>
                  <TableHead className="font-bold text-slate-600">Date</TableHead>
                  <TableHead className="font-bold text-slate-600 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const cfg = STATUS_CONFIG[r.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{r.school_name}</p>
                          <p className="text-xs text-slate-500">{r.school_type} · {r.student_count} students</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{r.contact_name}</p>
                          <p className="text-xs text-slate-500">{r.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {r.services_needed.slice(0, 2).map(s => (
                            <span key={s} className="inline-block rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              {s}
                            </span>
                          ))}
                          {r.services_needed.length > 2 && (
                            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              +{r.services_needed.length - 2}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 max-w-[120px] truncate">{r.location}</TableCell>
                      <TableCell>
                        {/* Inline status selector */}
                        <div className="relative w-[140px]">
                          {updatingId === r.id ? (
                            <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                              <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                            </div>
                          ) : (
                            <select
                              value={r.status}
                              onChange={e => updateStatus(r.id, e.target.value as Status)}
                              className={`w-full appearance-none rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${cfg.bg} ${cfg.color}`}
                            >
                              {STATUSES.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                            onClick={() => openDetail(r)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:bg-red-50"
                            onClick={() => setDeleteId(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          {selected && (() => {
            const cfg = STATUS_CONFIG[selected.status];
            const StatusIcon = cfg.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-lg">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                    {selected.school_name}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 pt-2">

                  {/* Status selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600">Status:</span>
                    <select
                      value={selected.status}
                      onChange={e => updateStatus(selected.id, e.target.value as Status)}
                      disabled={updatingId === selected.id}
                      className={`appearance-none rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer focus:outline-none ${cfg.bg} ${cfg.color}`}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {updatingId === selected.id && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  </div>

                  {/* School info */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                    {[
                      { icon: Building2,     label: "School Name",     value: selected.school_name  },
                      { icon: User,          label: "Contact Person",  value: selected.contact_name },
                      { icon: Phone,         label: "Phone",           value: selected.phone        },
                      { icon: Mail,          label: "Email",           value: selected.email        },
                      { icon: GraduationCap, label: "School Type",     value: selected.school_type  },
                      { icon: Users,         label: "No. of Students", value: selected.student_count},
                      { icon: MapPin,        label: "Location",        value: selected.location     },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-4 px-4 py-3">
                        <row.icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="w-36 shrink-0 text-xs font-semibold text-slate-500">{row.label}</span>
                        <span className="text-sm text-slate-800 font-medium">{row.value}</span>
                      </div>
                    ))}
                    <div className="flex items-start gap-4 px-4 py-3">
                      <CalendarCheck className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                      <span className="w-36 shrink-0 text-xs font-semibold text-slate-500">Book Visit</span>
                      <span className={`text-sm font-semibold ${selected.book_visit ? "text-blue-600" : "text-slate-400"}`}>
                        {selected.book_visit ? "Yes — Physical Visit Requested" : "No"}
                      </span>
                    </div>
                  </div>

                  {/* Services needed */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Services Needed</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.services_needed.map(s => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  {selected.message && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Message</p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                    <span>Submitted: {formatDate(selected.created_at)}</span>
                    <span>Last updated: {formatDate(selected.updated_at)}</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href={`mailto:${selected.email}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      <Mail className="h-4 w-4 text-blue-500" />
                      Send Email
                    </a>
                    <a
                      href={`tel:${selected.phone}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      <Phone className="h-4 w-4 text-emerald-500" />
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-sm"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-emerald-600"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl gap-2 ml-auto"
                      onClick={() => { setDetailOpen(false); setDeleteId(selected.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Request
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ── */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v && !deleting) setDeleteId(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Request
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 mt-1">
            Are you sure you want to permanently delete this implementation request? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting} className="rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
