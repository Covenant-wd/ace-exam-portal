import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, CheckCircle2, XCircle, Clock, DollarSign, Megaphone, BarChart3, ExternalLink } from "lucide-react";
import ReportCard from "@/components/ReportCard";
import { useSchoolCbtLink } from "@/hooks/useSchoolSettings";

interface AttendanceRecord { date: string; status: string; }
interface GradeRecord { subject_name: string; category_name: string; category_max_score: number; score: number; }
interface FeeRecord { fee_name: string; amount: number; amount_paid: number; payment_date: string; }
interface AnnouncementItem { id: string; title: string; content: string; created_at: string; }

export default function StudentDashboard() {
  const { user, schoolId } = useAuth();
  const { cbtLink } = useSchoolCbtLink();
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      if (schoolId) {
        const { data: sessData } = await supabase.from("sessions").select("name").eq("school_id", schoolId).eq("is_active", true).single();
        if (sessData) setActiveSession(sessData.name);
        const { data: termData } = await supabase.from("terms").select("name").eq("school_id", schoolId).eq("is_active", true).single();
        if (termData) setActiveTerm(termData.name);
      }

      const { data: attData } = await supabase.from("attendance").select("date, status")
        .eq("student_id", user.id).order("date", { ascending: false }).limit(50);
      const attRecords = (attData || []) as AttendanceRecord[];
      setAttendance(attRecords);
      setAttendanceStats({
        total: attRecords.length,
        present: attRecords.filter((a) => a.status === "present").length,
        absent: attRecords.filter((a) => a.status === "absent").length,
        late: attRecords.filter((a) => a.status === "late").length,
      });

      const { data: gradeData } = await supabase.from("grades").select(`
        score, max_score,
        subjects:subject_id(name),
        grade_categories:category_id(name, max_score)
      `).eq("student_id", user.id).order("created_at", { ascending: false });

      setGrades((gradeData || []).map((g: any) => ({
        subject_name: g.subjects?.name || "—",
        category_name: g.grade_categories?.name || "—",
        category_max_score: g.grade_categories?.max_score ?? g.max_score,
        score: g.score,
      })));

      const { data: feeData } = await supabase.from("fee_payments").select(`
        amount_paid, payment_date,
        fee_types:fee_type_id(name, amount)
      `).eq("student_id", user.id).order("created_at", { ascending: false });

      setFees((feeData || []).map((f: any) => ({
        fee_name: f.fee_types?.name || "—",
        amount: f.fee_types?.amount || 0,
        amount_paid: f.amount_paid,
        payment_date: f.payment_date,
      })));

      const annQuery = supabase.from("announcements").select("id, title, content, created_at")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(10);
      if (schoolId) annQuery.eq("school_id", schoolId);
      const { data: annData } = await annQuery;
      setAnnouncements((annData as AnnouncementItem[]) || []);

      setLoading(false);
    };
    load();
  }, [user, schoolId]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">My Dashboard</h1>
        {/* CBT Portal button — only shown if school has configured an external CBT link */}
        {cbtLink && (
          <a
            href={cbtLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <ExternalLink className="h-4 w-4" />
            Take Exam (CBT Portal)
          </a>
        )}
      </div>

      {/* Active Session & Term Banner */}
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
            <p className="text-2xl font-bold">{grades.length}</p>
            <p className="text-xs text-muted-foreground">Grades Recorded</p>
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
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-4">
          {announcements.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><Megaphone className="mx-auto mb-2 h-8 w-8 opacity-50" /><p>No announcements</p></CardContent></Card>
          ) : (
            announcements.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</p>
                </CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p></CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No attendance records</TableCell></TableRow>
                  ) : (
                    attendance.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>{new Date(a.date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades">
          <ReportCard grades={grades} term={activeTerm} session={activeSession} />
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No payment records</TableCell></TableRow>
                  ) : (
                    fees.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{f.fee_name}</TableCell>
                        <TableCell>₦{Number(f.amount_paid).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(f.payment_date).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
