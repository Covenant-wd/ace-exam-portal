import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Download, TrendingDown, Users, DollarSign, AlertTriangle, ChevronRight, Bell } from "lucide-react";
import { toast } from "sonner";
import StudentFeeDrawer from "./StudentFeeDrawer";

interface Debtor {
  student_id: string;
  full_name: string;
  class_id: string | null;
  class_name: string | null;
  total_fees: number;
  total_paid: number;
  balance: number;
}

interface FeeTotal {
  total_expected: number;
  total_collected: number;
  total_outstanding: number;
  student_count: number;
  paid_in_full: number;
  partial_payers: number;
  non_payers: number;
}

interface ClassItem { id: string; name: string; }
interface TermItem  { id: string; name: string; session_id: string; }
interface SessionItem { id: string; name: string; }

export default function Debtors() {
  const { schoolId } = useAuth();

  const [debtors,   setDebtors]   = useState<Debtor[]>([]);
  const [totals,    setTotals]    = useState<FeeTotal | null>(null);
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [terms,     setTerms]     = useState<TermItem[]>([]);
  const [sessions,  setSessions]  = useState<SessionItem[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Filters
  const [filterSession, setFilterSession] = useState("all");
  const [filterTerm,    setFilterTerm]    = useState("all");
  const [filterClass,   setFilterClass]   = useState("all");
  const [search,        setSearch]        = useState("");

  // Detail drawer
  const [drawerOpen,       setDrawerOpen]       = useState(false);
  const [selectedStudent,  setSelectedStudent]  = useState<Debtor | null>(null);

  // Load reference data once
  useEffect(() => {
    if (!schoolId) return;
    const init = async () => {
      const [classRes, termRes, sessRes] = await Promise.all([
        supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("terms").select("id, name, session_id").eq("school_id", schoolId).order("name"),
        supabase.from("sessions").select("id, name").eq("school_id", schoolId).order("name"),
      ]);
      setClasses((classRes.data as ClassItem[]) ?? []);
      setTerms((termRes.data as TermItem[]) ?? []);
      setSessions((sessRes.data as SessionItem[]) ?? []);

      // Default to active term
      const activeTerm = await supabase
        .from("terms").select("id").eq("school_id", schoolId).eq("is_active", true).maybeSingle();
      if (activeTerm.data) setFilterTerm(activeTerm.data.id);
    };
    init();
  }, [schoolId]);

  // Reload debtors when filters change
  const loadDebtors = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const termArg  = filterTerm  !== "all" ? filterTerm  : null;
    const classArg = filterClass !== "all" ? filterClass : null;

    const [debtorsRes, totalsRes] = await Promise.all([
      (supabase as any).rpc("get_school_fee_debtors", {
        _school_id: schoolId,
        _term_id:   termArg,
        _class_id:  classArg,
      }),
      (supabase as any).rpc("get_school_fee_totals", {
        _school_id: schoolId,
        _term_id:   termArg,
      }),
    ]);

    if (debtorsRes.error) { toast.error(debtorsRes.error.message); }
    else { setDebtors((debtorsRes.data as unknown as Debtor[]) ?? []); }

    if (totalsRes.data && (totalsRes.data as any[]).length > 0) {
      setTotals((totalsRes.data as unknown as FeeTotal[])[0]);
    }
    setLoading(false);
  }, [schoolId, filterTerm, filterClass]);

  useEffect(() => { loadDebtors(); }, [loadDebtors]);

  // Filter locally by search and session (session just filters terms dropdown)
  const visibleTerms = filterSession === "all"
    ? terms
    : terms.filter(t => t.session_id === filterSession);

  const filtered = debtors.filter(d => {
    if (!search) return true;
    return d.full_name.toLowerCase().includes(search.toLowerCase()) ||
           (d.class_name ?? "").toLowerCase().includes(search.toLowerCase());
  });

  // CSV export
  const downloadCSV = () => {
    const header = ["Student Name", "Class", "Total Fees (₦)", "Total Paid (₦)", "Balance (₦)", "Status"];
    const rows = filtered.map(d => [
      d.full_name,
      d.class_name ?? "—",
      Number(d.total_fees).toFixed(2),
      Number(d.total_paid).toFixed(2),
      Number(d.balance).toFixed(2),
      Number(d.balance) <= 0 ? "Paid" : Number(d.total_paid) > 0 ? "Partial" : "Unpaid",
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `debtors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  // Mock payment reminder
  const sendReminder = (d: Debtor) => {
    toast.success(`Reminder queued for ${d.full_name}`, {
      description: `Outstanding balance: ₦${Number(d.balance).toLocaleString()}`,
    });
  };

  const statusBadge = (d: Debtor) => {
    if (Number(d.balance) <= 0)
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Paid</Badge>;
    if (Number(d.total_paid) > 0)
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Unpaid</Badge>;
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Fee Defaulters</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Students with outstanding fee balances
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-1.5 self-start sm:self-auto">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Financial summary cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Expected",
              value: `₦${(Number(totals.total_expected) / 1000).toFixed(0)}k`,
              sub: `${totals.student_count} students`,
              icon: DollarSign,
              color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
              iconBg: "bg-blue-100 dark:bg-blue-900/40",
            },
            {
              label: "Collected",
              value: `₦${(Number(totals.total_collected) / 1000).toFixed(0)}k`,
              sub: `${totals.paid_in_full} paid in full`,
              icon: TrendingDown,
              color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
              iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
            },
            {
              label: "Outstanding",
              value: `₦${(Number(totals.total_outstanding) / 1000).toFixed(0)}k`,
              sub: `${totals.non_payers} unpaid`,
              icon: AlertTriangle,
              color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
              iconBg: "bg-red-100 dark:bg-red-900/40",
            },
            {
              label: "Partial",
              value: totals.partial_payers,
              sub: "paying partly",
              icon: Users,
              color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
              iconBg: "bg-amber-100 dark:bg-amber-900/40",
            },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className={`flex items-center gap-3 p-4 rounded-xl ${s.color}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.iconBg}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-extrabold leading-none">{s.value}</p>
                  <p className="text-xs opacity-75 mt-0.5">{s.label}</p>
                  <p className="text-xs opacity-60">{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search student or class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterSession} onValueChange={v => { setFilterSession(v); setFilterTerm("all"); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTerm} onValueChange={setFilterTerm}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Term" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terms</SelectItem>
            {visibleTerms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {loading ? "Loading..." : `${filtered.length} student${filtered.length !== 1 ? "s" : ""}`}
            {search && <span className="text-muted-foreground font-normal text-sm ml-1">matching "{search}"</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">No students found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Total Fee</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d, i) => {
                  const isDebtor = Number(d.balance) > 0;
                  return (
                    <TableRow
                      key={d.student_id}
                      className={`cursor-pointer transition-colors ${isDebtor ? "hover:bg-red-50/40 dark:hover:bg-red-950/20" : "hover:bg-muted/40"}`}
                      onClick={() => { setSelectedStudent(d); setDrawerOpen(true); }}
                    >
                      <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                      <TableCell>
                        <span className={`font-medium text-sm ${isDebtor ? "text-red-700 dark:text-red-400" : ""}`}>
                          {d.full_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.class_name ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">₦{Number(d.total_fees).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-600">₦{Number(d.total_paid).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">
                        {isDebtor
                          ? <span className="font-bold text-red-600">₦{Number(d.balance).toLocaleString()}</span>
                          : <span className="text-emerald-600">✓ Paid</span>
                        }
                      </TableCell>
                      <TableCell>{statusBadge(d)}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()} className="w-20">
                        <div className="flex gap-1">
                          {isDebtor && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              title="Send reminder"
                              onClick={() => sendReminder(d)}
                            >
                              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Student detail drawer */}
      {selectedStudent && (
        <StudentFeeDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          studentId={selectedStudent.student_id}
          studentName={selectedStudent.full_name}
          schoolId={schoolId!}
          termId={filterTerm !== "all" ? filterTerm : null}
          onRecordPayment={(sid) => {
            setDrawerOpen(false);
            // Navigate to fees page with pre-filled student
            window.location.href = `/admin/fees?student=${sid}`;
          }}
        />
      )}
    </div>
  );
}
