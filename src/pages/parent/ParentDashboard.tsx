// src/pages/parent/ParentDashboard.tsx
// Updated: adds a "Report Card" tab alongside existing tabs.
// All existing logic is untouched — only the import, term selector
// state, report card fetch, and the new tab are added.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirstName } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, XCircle, Clock, DollarSign,
  Megaphone, BarChart3, Users, FileText,
} from "lucide-react";
import ReportCard from "@/components/ReportCard";
import type { RawGrade, PsychomotorData, AffectiveData } from "@/components/ReportCard";

interface Child         { student_id: string; full_name: string; }
interface AttendanceRecord { date: string; status: string; }
interface GradeRecord   { subject_name: string; category_name: string; category_max_score: number; score: number; }
interface FeeRecord     { fee_name: string; amount_paid: number; payment_date: string; }
interface FeeOverviewItem { fee_type_id: string; fee_name: string; fee_amount: number; amount_paid: number; balance: number; }
interface ExamResult    { exam_title: string; score: number; total_questions: number; submitted_at: string; }
interface AnnouncementItem { id: string; title: string; content: string; created_at: string; }
interface TermItem      { id: string; name: string; session_id: string; }
interface SessionItem   { id: string; name: string; }

export default function ParentDashboard() {
  const { user, schoolId } = useAuth();
  const { schoolName } = useSchoolName();
  const { logoUrl }    = useSchoolLogo();

  // ── Existing state ────────────────────────────────────────────
  const [children,       setChildren]       = useState<Child[]>([]);
  const [selectedChild,  setSelectedChild]  = useState<string>("");
  const [loading,        setLoading]        = useState(true);
  const [dataLoading,    setDataLoading]    = useState(false);
  const [attendance,     setAttendance]     = useState<AttendanceRecord[]>([]);
  const [grades,         setGrades]         = useState<GradeRecord[]>([]);
  const [fees,           setFees]           = useState<FeeRecord[]>([]);
  const [feeOverview,    setFeeOverview]    = useState<FeeOverviewItem[]>([]);
  const [results,        setResults]        = useState<ExamResult[]>([]);
  const [announcements,  setAnnouncements]  = useState<AnnouncementItem[]>([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0 });
  const [activeSession,  setActiveSession]  = useState<string | null>(null);
  const [activeTerm,     setActiveTerm]     = useState<string | null>(null);
  const [childSchoolId,  setChildSchoolId]  = useState<string | null>(null);
  const [childProfiles,  setChildProfiles]  = useState<Record<string, any>>({});

  // ── NEW: report card state ────────────────────────────────────
  const [terms,          setTerms]          = useState<TermItem[]>([]);
  const [sessions,       setSessions]       = useState<SessionItem[]>([]);
  const [selectedTerm,   setSelectedTerm]   = useState("");
  const [rcLoading,      setRcLoading]      = useState(false);
  const [rcGrades,       setRcGrades]       = useState<RawGrade[]>([]);
  const [rcPsychomotor,  setRcPsychomotor]  = useState<PsychomotorData | undefined>();
  const [rcAffective,    setRcAffective]    = useState<AffectiveData | undefined>();
  const [rcMetadata,     setRcMetadata]     = useState<any>(null);
  const [rcClassAverages, setRcClassAverages] = useState<Record<string, number>>({});
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [schoolContact,  setSchoolContact]  = useState("");

  // ── Load children (existing logic, unchanged) ─────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: links, error: linksErr } = await supabase
          .from("parent_students").select("student_id").eq("parent_id", user.id);
        if (linksErr) console.error("parent_students error:", linksErr);

        if (links && links.length > 0) {
          const ids = links.map((l: any) => l.student_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, school_id, class_id, username, gender, date_of_birth")
            .in("user_id", ids).order("full_name");

          const childList = (profiles || []).map((p: any) => ({ student_id: p.user_id, full_name: p.full_name }));
          setChildren(childList);
          if (childList.length > 0) setSelectedChild(childList[0].student_id);

          const profileMap: Record<string, any> = {};
          (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });
          setChildProfiles(profileMap);

          const effectiveSchoolId = schoolId || (profiles?.[0] as any)?.school_id || null;
          setChildSchoolId(effectiveSchoolId);

          if (effectiveSchoolId) {
            const [sessRes, termRes, allTermsRes, allSessRes, settingsRes] = await Promise.all([
              supabase.from("sessions").select("name").eq("school_id", effectiveSchoolId).eq("is_active", true).maybeSingle(),
              supabase.from("terms").select("name").eq("school_id", effectiveSchoolId).eq("is_active", true).maybeSingle(),
              supabase.from("terms").select("id,name,session_id").eq("school_id", effectiveSchoolId).order("name"),
              supabase.from("sessions").select("id,name").eq("school_id", effectiveSchoolId),
              supabase.from("school_settings").select("key,value").eq("school_id", effectiveSchoolId)
                .in("key", ["school_address", "school_contact"]),
            ]);
            if (sessRes.data) setActiveSession(sessRes.data.name);
            if (termRes.data) setActiveTerm(termRes.data.name);
            setTerms((allTermsRes.data as TermItem[]) || []);
            setSessions((allSessRes.data as SessionItem[]) || []);
            ((settingsRes.data || []) as any[]).forEach(s => {
              if (s.key === "school_address") setSchoolAddress(s.value || "");
              if (s.key === "school_contact") setSchoolContact(s.value || "");
            });
          }
        }
      } catch (err: any) {
        console.error("ParentDashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, schoolId]);

  // ── Load child's data (existing logic, unchanged) ─────────────
  useEffect(() => {
    if (!selectedChild || !childSchoolId) return;
    const loadChildData = async () => {
      setDataLoading(true);
      try {
        const [attRes, gradesRes, feesRes, resultsRes, annRes, feeTypesRes, childProfileRes] = await Promise.all([
          supabase.from("attendance").select("date, status").eq("student_id", selectedChild)
            .order("date", { ascending: false }).limit(50),
          supabase.from("grades")
            .select("score, max_score, subjects:subject_id(name), grade_categories:category_id(name, max_score)")
            .eq("student_id", selectedChild).order("created_at", { ascending: false }),
          supabase.from("fee_payments")
            .select("amount_paid, payment_date, fee_type_id, fee_types:fee_type_id(name, amount)")
            .eq("student_id", selectedChild).order("created_at", { ascending: false }),
          supabase.from("exam_attempts")
            .select("score, total_questions, submitted_at, exams:exam_id(title)")
            .eq("student_id", selectedChild).eq("is_submitted", true)
            .order("submitted_at", { ascending: false }),
          supabase.from("announcements").select("id, title, content, created_at")
            .eq("is_active", true).eq("school_id", childSchoolId)
            .order("created_at", { ascending: false }).limit(10),
          supabase.from("fee_types").select("id, name, amount, class_id, term_id, is_active")
            .eq("school_id", childSchoolId).eq("is_active", true),
          supabase.from("profiles").select("class_id").eq("user_id", selectedChild).maybeSingle(),
        ]);

        if (attRes.error)     console.error("attendance error:",   attRes.error);
        if (gradesRes.error)  console.error("grades error:",       gradesRes.error);
        if (feesRes.error)    console.error("fee_payments error:",  feesRes.error);
        if (resultsRes.error) console.error("exam_attempts error:", resultsRes.error);
        if (annRes.error)     console.error("announcements error:", annRes.error);

        const attRecords = (attRes.data || []) as AttendanceRecord[];
        setAttendance(attRecords);
        setAttendanceStats({
          present: attRecords.filter(a => a.status === "present").length,
          absent:  attRecords.filter(a => a.status === "absent").length,
          late:    attRecords.filter(a => a.status === "late").length,
        });

        setGrades((gradesRes.data || []).map((g: any) => ({
          subject_name:       g.subjects?.name           || "—",
          category_name:      g.grade_categories?.name   || "—",
          category_max_score: g.grade_categories?.max_score ?? g.max_score,
          score: g.score,
        })));

        const payments = (feesRes.data || []) as any[];
        setFees(payments.map((f: any) => ({ fee_name: f.fee_types?.name || "—", amount_paid: f.amount_paid, payment_date: f.payment_date })));

        const childClassId = (childProfileRes.data as any)?.class_id || null;
        const applicableTypes = ((feeTypesRes.data || []) as any[]).filter(t => (!t.class_id || t.class_id === childClassId));
        const paidByType: Record<string, number> = {};
        payments.forEach((p: any) => { paidByType[p.fee_type_id] = (paidByType[p.fee_type_id] || 0) + Number(p.amount_paid || 0); });
        const knownIds = new Set(applicableTypes.map(t => t.id));
        const historicalIds = Object.keys(paidByType).filter(id => !knownIds.has(id));
        const historicalTypes = historicalIds.map(id => {
          const sample = payments.find((p: any) => p.fee_type_id === id);
          return { id, name: sample?.fee_types?.name || "Other Fee", amount: Number(sample?.fee_types?.amount || 0) };
        });
        const overview: FeeOverviewItem[] = [...applicableTypes, ...historicalTypes].map((t: any) => {
          const paid = paidByType[t.id] || 0;
          const amount = Number(t.amount || 0);
          return { fee_type_id: t.id, fee_name: t.name, fee_amount: amount, amount_paid: paid, balance: Math.max(0, amount - paid) };
        });
        setFeeOverview(overview);

        setResults((resultsRes.data || []).map((r: any) => ({
          exam_title: r.exams?.title || "—", score: r.score,
          total_questions: r.total_questions, submitted_at: r.submitted_at,
        })));
        setAnnouncements((annRes.data as AnnouncementItem[]) || []);
      } catch (err: any) {
        console.error("ParentDashboard loadChildData error:", err);
      } finally {
        setDataLoading(false);
      }
    };
    loadChildData();
  }, [selectedChild, childSchoolId]);

  // ── NEW: load report card when term selected ──────────────────
  useEffect(() => {
    if (!selectedTerm || !selectedChild || !childSchoolId) return;
    const childProfile = childProfiles[selectedChild];
    if (!childProfile?.class_id) return;

    const load = async () => {
      setRcLoading(true);
      try {
        const [metaRes, pmRes, afRes, gradesRes] = await Promise.all([
          supabase.from("report_card_metadata")
            .select("*").eq("student_id", selectedChild).eq("term_id", selectedTerm).maybeSingle(),
          supabase.from("psychomotor_ratings")
            .select("*").eq("student_id", selectedChild).eq("term_id", selectedTerm).maybeSingle(),
          supabase.from("affective_ratings")
            .select("*").eq("student_id", selectedChild).eq("term_id", selectedTerm).maybeSingle(),
          supabase.from("grades")
            .select("student_id,score,subjects:subject_id(name),grade_categories:category_id(name,max_score)")
            .eq("student_id", selectedChild)
            .eq("class_id", childProfile.class_id)
            .eq("term_id", selectedTerm),
        ]);

        setRcMetadata(metaRes.data);
        setRcPsychomotor(pmRes.data || undefined);
        setRcAffective(afRes.data || undefined);

        const rawGrades: RawGrade[] = ((gradesRes.data || []) as any[]).map(g => ({
          subject_name:       g.subjects?.name || "—",
          category_name:      g.grade_categories?.name || "—",
          category_max_score: g.grade_categories?.max_score ?? 0,
          score:              g.score,
        }));
        setRcGrades(rawGrades);

        // Class averages for performance chart
        const { data: classGrades } = await supabase
          .from("grades")
          .select("score, subjects:subject_id(name)")
          .eq("class_id", childProfile.class_id)
          .eq("term_id", selectedTerm);
        const totals: Record<string, { sum: number; count: number }> = {};
        ((classGrades || []) as any[]).forEach(g => {
          const sname = g.subjects?.name || "—";
          if (!totals[sname]) totals[sname] = { sum: 0, count: 0 };
          totals[sname].sum   += g.score;
          totals[sname].count += 1;
        });
        const avgs: Record<string, number> = {};
        Object.entries(totals).forEach(([n, { sum, count }]) => { avgs[n] = count > 0 ? Math.round(sum / count) : 0; });
        setRcClassAverages(avgs);
      } catch (err: any) {
        console.error("report card load error:", err);
      } finally {
        setRcLoading(false);
      }
    };
    load();
  }, [selectedTerm, selectedChild, childSchoolId, childProfiles]);

  // ── Helpers ───────────────────────────────────────────────────
  const getAge = (dob: string | null) => {
    if (!dob) return undefined;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() - birth.getMonth() < 0 ||
       (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const selectedSession = (() => {
    const t = terms.find(t => t.id === selectedTerm);
    if (!t) return "";
    return sessions.find(s => s.id === t.session_id)?.name || "";
  })();

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Welcome, {getFirstName(user)}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>No children assigned to your account yet.</p>
            <p className="text-sm mt-1">Contact your school admin to link your children.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedChildName = children.find(c => c.student_id === selectedChild)?.full_name || "";
  const selectedChildProfile = childProfiles[selectedChild];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Welcome, {getFirstName(user)}</h1>
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={v => { setSelectedChild(v); setSelectedTerm(""); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select child" /></SelectTrigger>
            <SelectContent>
              {children.map(c => <SelectItem key={c.student_id} value={c.student_id}>{c.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {(activeSession || activeTerm) && (
        <Card className="border-0 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>Current Period:</span>
            </div>
            {activeSession && <Badge variant="outline" className="text-sm font-medium">{activeSession}</Badge>}
            {activeTerm && <Badge className="text-sm font-medium">{activeTerm}</Badge>}
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground font-medium">
        Viewing: <span className="text-foreground font-semibold">{selectedChildName}</span>
      </div>

      {dataLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
              <p className="text-2xl font-bold">{attendanceStats.present}</p>
              <p className="text-xs text-muted-foreground">Days Present</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <XCircle className="mx-auto mb-1 h-5 w-5 text-red-600" />
              <p className="text-2xl font-bold">{attendanceStats.absent}</p>
              <p className="text-xs text-muted-foreground">Days Absent</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
              <p className="text-2xl font-bold">{results.length}</p>
              <p className="text-xs text-muted-foreground">Exams Taken</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <DollarSign className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
              <p className="text-2xl font-bold">{fees.length}</p>
              <p className="text-xs text-muted-foreground">Payments Made</p>
            </CardContent></Card>
          </div>

          <Tabs defaultValue="announcements">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="announcements">Announcements</TabsTrigger>
              <TabsTrigger value="results">Exam Results</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="grades">Grades</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
              <TabsTrigger value="reportcard" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Report Card
              </TabsTrigger>
            </TabsList>

            {/* ── Announcements (unchanged) ─────────────────────── */}
            <TabsContent value="announcements" className="space-y-4">
              {announcements.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">
                  <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-50" /><p>No announcements</p>
                </CardContent></Card>
              ) : announcements.map(a => (
                <Card key={a.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</p>
                  </CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p></CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* ── Exam Results (unchanged) ──────────────────────── */}
            <TabsContent value="results">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead><TableHead>Score</TableHead>
                      <TableHead>Percentage</TableHead><TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No exam results yet</TableCell></TableRow>
                    ) : results.map((r, i) => {
                      const pct = r.total_questions ? Math.round((r.score / r.total_questions) * 100) : 0;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.exam_title}</TableCell>
                          <TableCell>{r.score}/{r.total_questions}</TableCell>
                          <TableCell><Badge variant={pct >= 50 ? "default" : "destructive"}>{pct}%</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            {/* ── Attendance (unchanged) ────────────────────────── */}
            <TabsContent value="attendance">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {attendance.length === 0 ? (
                      <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No attendance records</TableCell></TableRow>
                    ) : attendance.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>{new Date(a.date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>{a.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            {/* ── Grades (existing ReportCard shallow view, unchanged) */}
            <TabsContent value="grades">
              <ReportCard grades={grades} studentName={selectedChildName} term={activeTerm} session={activeSession} showPrintButton={false} />
            </TabsContent>

            {/* ── Fees (unchanged) ──────────────────────────────── */}
            <TabsContent value="fees" className="space-y-4">
              {(() => {
                const totalFees    = feeOverview.reduce((s, f) => s + f.fee_amount, 0);
                const totalPaid    = feeOverview.reduce((s, f) => s + f.amount_paid, 0);
                const totalBalance = Math.max(0, totalFees - totalPaid);
                const pct          = totalFees > 0 ? Math.min(100, Math.round((totalPaid / totalFees) * 100)) : 0;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Card><CardContent className="p-4 text-center">
                        <p className="text-lg font-bold">₦{totalFees.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Total Fees</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-4 text-center">
                        <p className="text-lg font-bold text-emerald-600">₦{totalPaid.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Total Paid</p>
                      </CardContent></Card>
                      <Card><CardContent className="p-4 text-center">
                        <p className={`text-lg font-bold ${totalBalance > 0 ? "text-red-600" : "text-emerald-600"}`}>₦{totalBalance.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Outstanding</p>
                      </CardContent></Card>
                    </div>
                    {totalFees > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{pct}% paid</span>
                          <span>{totalBalance > 0 ? `₦${totalBalance.toLocaleString()} remaining` : "Fully paid"}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct > 50 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">Fee Breakdown</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fee Type</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                              <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {feeOverview.length === 0 ? (
                              <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No fees assigned</TableCell></TableRow>
                            ) : feeOverview.map(f => (
                              <TableRow key={f.fee_type_id}>
                                <TableCell className="font-medium">{f.fee_name}</TableCell>
                                <TableCell className="text-right">₦{f.fee_amount.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-emerald-600">₦{f.amount_paid.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <span className={f.balance > 0 ? "text-red-600 font-medium" : "text-emerald-600"}>
                                    {f.balance > 0 ? `₦${f.balance.toLocaleString()}` : "✓ Cleared"}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                );
              })()}
            </TabsContent>

            {/* ── NEW: Report Card tab ──────────────────────────── */}
            <TabsContent value="reportcard" className="space-y-4">
              <div className="max-w-xs space-y-1.5">
                <Label>Select Term</Label>
                <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                  <SelectTrigger><SelectValue placeholder="Choose a term" /></SelectTrigger>
                  <SelectContent>
                    {terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {!selectedTerm ? (
                <p className="text-muted-foreground text-sm py-4">Select a term to view the report card.</p>
              ) : rcLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : !rcMetadata?.is_published ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                    <p className="font-medium">Report card not yet published</p>
                    <p className="text-sm mt-1">The school will publish it once all records are finalised.</p>
                  </CardContent>
                </Card>
              ) : (
                <ReportCard
                  grades={rcGrades}
                  studentName={selectedChildName}
                  admissionNumber={selectedChildProfile?.username || undefined}
                  gender={selectedChildProfile?.gender || undefined}
                  age={getAge(selectedChildProfile?.date_of_birth || null)}
                  term={terms.find(t => t.id === selectedTerm)?.name}
                  session={selectedSession}
                  schoolName={schoolName}
                  schoolLogoUrl={logoUrl || undefined}
                  schoolAddress={schoolAddress || undefined}
                  schoolContact={schoolContact || undefined}
                  timesPresent={rcMetadata?.times_present}
                  timesAbsent={rcMetadata?.times_absent}
                  timesPunctual={rcMetadata?.times_punctual}
                  timesSchoolOpened={rcMetadata?.times_school_opened}
                  classPosition={rcMetadata?.class_position}
                  totalStudents={rcMetadata?.total_students}
                  classTeacherComment={rcMetadata?.class_teacher_comment}
                  principalComment={rcMetadata?.principal_comment}
                  reopeningDate={rcMetadata?.reopening_date}
                  psychomotor={rcPsychomotor}
                  affective={rcAffective}
                  classAverages={rcClassAverages}
                  showPrintButton
                />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
