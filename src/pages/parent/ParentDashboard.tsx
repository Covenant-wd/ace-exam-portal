import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, Clock, DollarSign, Megaphone, BarChart3, Users } from "lucide-react";
import ReportCard from "@/components/ReportCard";

interface Child { student_id: string; full_name: string; }
interface AttendanceRecord { date: string; status: string; }
interface GradeRecord { subject_name: string; category_name: string; category_max_score: number; score: number; }
interface FeeRecord { fee_name: string; amount_paid: number; payment_date: string; }
interface ExamResult { exam_title: string; score: number; total_questions: number; submitted_at: string; }
interface AnnouncementItem { id: string; title: string; content: string; created_at: string; }

export default function ParentDashboard() {
  const { user, schoolId } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0 });
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  // School ID derived from child's profile — more reliable than useAuth() for parents
  // because parents look up school via their child, not their own user_roles row
  const [childSchoolId, setChildSchoolId] = useState<string | null>(null);

  // Load children linked to this parent
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: links, error: linksErr } = await supabase
          .from("parent_students")
          .select("student_id")
          .eq("parent_id", user.id);

        if (linksErr) console.error("parent_students error:", linksErr);

        if (links && links.length > 0) {
          const ids = links.map((l: any) => l.student_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, school_id")
            .in("user_id", ids)
            .order("full_name");
          const childList = (profiles || []).map((p: any) => ({ student_id: p.user_id, full_name: p.full_name }));
          setChildren(childList);
          if (childList.length > 0) setSelectedChild(childList[0].student_id);

          // Derive schoolId from first child's profile — parents may not have
          // school_id populated in user_roles if created before that column was added
          const effectiveSchoolId = schoolId || (profiles?.[0] as any)?.school_id || null;
          setChildSchoolId(effectiveSchoolId);

          // Load active session & term
          if (effectiveSchoolId) {
            const [sessRes, termRes] = await Promise.all([
              supabase.from("sessions").select("name").eq("school_id", effectiveSchoolId).eq("is_active", true).maybeSingle(),
              supabase.from("terms").select("name").eq("school_id", effectiveSchoolId).eq("is_active", true).maybeSingle(),
            ]);
            if (sessRes.data) setActiveSession(sessRes.data.name);
            if (termRes.data) setActiveTerm(termRes.data.name);
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

  // Load child's data when selection changes
  useEffect(() => {
    if (!selectedChild) return;
    const loadChildData = async () => {
      setDataLoading(true);

      const [attRes, gradesRes, feesRes, resultsRes, annRes] = await Promise.all([
        supabase.from("attendance").select("date, status").eq("student_id", selectedChild).order("date", { ascending: false }).limit(50),
        supabase.from("grades").select("score, max_score, subjects:subject_id(name), grade_categories:category_id(name, max_score)").eq("student_id", selectedChild).order("created_at", { ascending: false }),
        supabase.from("fee_payments").select("amount_paid, payment_date, fee_types:fee_type_id(name, amount)").eq("student_id", selectedChild).order("created_at", { ascending: false }),
        supabase.from("exam_attempts").select("score, total_questions, submitted_at, exams:exam_id(title)").eq("student_id", selectedChild).eq("is_submitted", true).order("submitted_at", { ascending: false }),
        // Use childSchoolId derived from child's profile — schoolId from useAuth()
        // may be null for parents whose user_roles row lacks school_id
        ...(childSchoolId
          ? [supabase.from("announcements").select("id, title, content, created_at").eq("is_active", true).eq("school_id", childSchoolId).order("created_at", { ascending: false }).limit(10)]
          : [supabase.from("announcements").select("id, title, content, created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(10)]
        )[0],
      ]);

      const attRecords = (attRes.data || []) as AttendanceRecord[];
      setAttendance(attRecords);
      setAttendanceStats({
        present: attRecords.filter(a => a.status === "present").length,
        absent: attRecords.filter(a => a.status === "absent").length,
        late: attRecords.filter(a => a.status === "late").length,
      });

      setGrades((gradesRes.data || []).map((g: any) => ({
        subject_name: g.subjects?.name || "—",
        category_name: g.grade_categories?.name || "—",
        category_max_score: g.grade_categories?.max_score ?? g.max_score,
        score: g.score,
      })));

      setFees((feesRes.data || []).map((f: any) => ({
        fee_name: f.fee_types?.name || "—",
        amount_paid: f.amount_paid,
        payment_date: f.payment_date,
      })));

      setResults((resultsRes.data || []).map((r: any) => ({
        exam_title: r.exams?.title || "—",
        score: r.score,
        total_questions: r.total_questions,
        submitted_at: r.submitted_at,
      })));

      setAnnouncements((annRes.data as AnnouncementItem[]) || []);
      setDataLoading(false);
    };
    loadChildData();
  }, [selectedChild, schoolId, childSchoolId]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Parent Dashboard</h1>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Parent Dashboard</h1>
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select child" />
            </SelectTrigger>
            <SelectContent>
              {children.map(c => (
                <SelectItem key={c.student_id} value={c.student_id}>{c.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Active Session & Term */}
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

      {/* Child name banner */}
      <div className="text-sm text-muted-foreground font-medium">
        Viewing: <span className="text-foreground font-semibold">{selectedChildName}</span>
      </div>

      {dataLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                <p className="text-2xl font-bold">{attendanceStats.present}</p>
                <p className="text-xs text-muted-foreground">Days Present</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <XCircle className="mx-auto mb-1 h-5 w-5 text-red-600" />
                <p className="text-2xl font-bold">{attendanceStats.absent}</p>
                <p className="text-xs text-muted-foreground">Days Absent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="text-2xl font-bold">{results.length}</p>
                <p className="text-xs text-muted-foreground">Exams Taken</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
                <p className="text-2xl font-bold">{fees.length}</p>
                <p className="text-xs text-muted-foreground">Payments Made</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="announcements">
            <TabsList>
              <TabsTrigger value="announcements">Announcements</TabsTrigger>
              <TabsTrigger value="results">Exam Results</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="grades">Grades</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
            </TabsList>

            <TabsContent value="announcements" className="space-y-4">
              {announcements.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground"><Megaphone className="mx-auto mb-2 h-8 w-8 opacity-50" /><p>No announcements</p></CardContent></Card>
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

            <TabsContent value="results">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exam</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Percentage</TableHead>
                        <TableHead>Date</TableHead>
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attendance">
              <Card>
                <CardContent className="p-0">
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="grades">
              <ReportCard
                grades={grades}
                studentName={selectedChildName}
                term={activeTerm}
                session={activeSession}
              />
            </TabsContent>

            <TabsContent value="fees">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Fee</TableHead><TableHead>Amount Paid</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {fees.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No payment records</TableCell></TableRow>
                      ) : fees.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{f.fee_name}</TableCell>
                          <TableCell>₦{Number(f.amount_paid).toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground">{new Date(f.payment_date).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
