// src/pages/student/StudentResults.tsx
// Updated to add a "Report Card" tab alongside the existing CBT results tab.
// The CBT results tab is completely unchanged — only a new tab is added.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, BarChart3, FileText } from "lucide-react";
import ReportCard from "@/components/ReportCard";
import type { RawGrade, PsychomotorData, AffectiveData } from "@/components/ReportCard";

interface TermItem    { id: string; name: string; session_id: string; }
interface SessionItem { id: string; name: string; }

export default function StudentResults() {
  const { user, schoolId } = useAuth();
  const { schoolName }  = useSchoolName();
  const { logoUrl }     = useSchoolLogo();

  // ── CBT results (unchanged) ────────────────────────────────────
  const [results,  setResults]  = useState<any[]>([]);
  const [cbtLoading, setCbtLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("exam_attempts")
      .select("*, exams(title, exam_type, subjects(name))")
      .eq("student_id", user!.id)
      .eq("is_submitted", true)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        const mcqOnly = (data ?? []).filter(
          (r: any) => (r.exams?.exam_type ?? "mcq") !== "theory"
        );
        setResults(mcqOnly);
        setCbtLoading(false);
      });
  }, [user]);

  // ── Report card data ───────────────────────────────────────────
  const [terms,           setTerms]           = useState<TermItem[]>([]);
  const [sessions,        setSessions]        = useState<SessionItem[]>([]);
  const [selectedTerm,    setSelectedTerm]    = useState("");
  const [rcLoading,       setRcLoading]       = useState(false);
  const [grades,          setGrades]          = useState<RawGrade[]>([]);
  const [psychomotor,     setPsychomotor]     = useState<PsychomotorData | undefined>();
  const [affective,       setAffective]       = useState<AffectiveData | undefined>();
  const [metadata,        setMetadata]        = useState<any>(null);
  const [profile,         setProfile]         = useState<any>(null);
  const [schoolAddress,   setSchoolAddress]   = useState("");
  const [schoolContact,   setSchoolContact]   = useState("");
  const [timesSchoolOpened, setTimesSchoolOpened] = useState<number | undefined>();
  const [classAverages,   setClassAverages]   = useState<Record<string, number>>({});

  // Load terms and student profile on mount
  useEffect(() => {
    if (!schoolId || !user) return;
    const init = async () => {
      const [termRes, sessRes, profileRes, settingsRes] = await Promise.all([
        supabase.from("terms").select("id,name,session_id").eq("school_id", schoolId).order("name"),
        supabase.from("sessions").select("id,name").eq("school_id", schoolId),
        supabase.from("profiles").select("full_name,username,gender,date_of_birth,class_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("school_settings").select("key,value").eq("school_id", schoolId)
          .in("key", ["school_address", "school_contact"]),
      ]);
      setTerms((termRes.data as TermItem[]) || []);
      setSessions((sessRes.data as SessionItem[]) || []);
      setProfile(profileRes.data);
      ((settingsRes.data || []) as any[]).forEach(s => {
        if (s.key === "school_address") setSchoolAddress(s.value || "");
        if (s.key === "school_contact") setSchoolContact(s.value || "");
      });
    };
    init();
  }, [schoolId, user]);

  // Load report card data when term is selected
  useEffect(() => {
    if (!selectedTerm || !user || !profile?.class_id || !schoolId) return;
    const load = async () => {
      setRcLoading(true);

      const [metaRes, pmRes, afRes, gradesRes, tsoRes] = await Promise.all([
        supabase.from("report_card_metadata")
          .select("*").eq("student_id", user.id).eq("term_id", selectedTerm).maybeSingle(),
        supabase.from("psychomotor_ratings")
          .select("*").eq("student_id", user.id).eq("term_id", selectedTerm).maybeSingle(),
        supabase.from("affective_ratings")
          .select("*").eq("student_id", user.id).eq("term_id", selectedTerm).maybeSingle(),
        supabase.from("grades")
          .select("student_id,score,subjects:subject_id(name),grade_categories:category_id(name,max_score)")
          .eq("student_id", user.id)
          .eq("class_id", profile.class_id)
          .eq("term_id", selectedTerm),
        supabase.from("school_settings")
          .select("value").eq("school_id", schoolId)
          .eq("key", `times_school_opened_${selectedTerm}`).maybeSingle(),
      ]);

      setMetadata(metaRes.data);
      setPsychomotor(pmRes.data || undefined);
      setAffective(afRes.data || undefined);
      setTimesSchoolOpened(tsoRes.data ? parseInt(tsoRes.data.value) || undefined : undefined);

      const rawGrades: RawGrade[] = ((gradesRes.data || []) as any[]).map(g => ({
        subject_name:       g.subjects?.name || "—",
        category_name:      g.grade_categories?.name || "—",
        category_max_score: g.grade_categories?.max_score ?? 0,
        score:              g.score,
      }));
      setGrades(rawGrades);

      // Compute class averages for chart
      if (profile.class_id) {
        const { data: classGrades } = await supabase
          .from("grades")
          .select("score, subjects:subject_id(name), grade_categories:category_id(name,max_score)")
          .eq("class_id", profile.class_id)
          .eq("term_id", selectedTerm);

        const totals: Record<string, { sum: number; count: number }> = {};
        ((classGrades || []) as any[]).forEach(g => {
          const sname = g.subjects?.name || "—";
          if (!totals[sname]) totals[sname] = { sum: 0, count: 0 };
          totals[sname].sum   += g.score;
          totals[sname].count += 1;
        });
        const avgs: Record<string, number> = {};
        Object.entries(totals).forEach(([name, { sum, count }]) => {
          avgs[name] = count > 0 ? Math.round(sum / count) : 0;
        });
        setClassAverages(avgs);
      }

      setRcLoading(false);
    };
    load();
  }, [selectedTerm, user, profile, schoolId]);

  const selectedSession = (() => {
    const t = terms.find(t => t.id === selectedTerm);
    if (!t) return "";
    return sessions.find(s => s.id === t.session_id)?.name || "";
  })();

  const getAge = (dob: string | null) => {
    if (!dob) return undefined;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() - birth.getMonth() < 0 ||
       (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Results</h1>

      <Tabs defaultValue="cbt">
        <TabsList>
          <TabsTrigger value="cbt" className="gap-2">
            <BarChart3 className="h-3.5 w-3.5" />
            CBT Exam Results
          </TabsTrigger>
          <TabsTrigger value="reportcard" className="gap-2">
            <FileText className="h-3.5 w-3.5" />
            Report Card
          </TabsTrigger>
        </TabsList>

        {/* ── CBT tab (unchanged logic) ─────────────────────────── */}
        <TabsContent value="cbt">
          {cbtLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground py-6">You haven't completed any MCQ exams yet.</p>
          ) : (
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => {
                      const pct = r.total_questions
                        ? Math.round((r.score / r.total_questions) * 100) : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.exams?.title || "—"}</TableCell>
                          <TableCell>{r.exams?.subjects?.name || "—"}</TableCell>
                          <TableCell>{r.score}/{r.total_questions}</TableCell>
                          <TableCell>{pct}%</TableCell>
                          <TableCell>
                            <Badge variant={pct >= 50 ? "default" : "destructive"}>
                              {pct >= 50 ? "Pass" : "Fail"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Report Card tab ───────────────────────────────────── */}
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
            <p className="text-muted-foreground text-sm py-4">Select a term to view your report card.</p>
          ) : rcLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !metadata?.is_published ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                <p className="font-medium">Report card not yet published</p>
                <p className="text-sm mt-1">Your school will publish it once all records are finalised.</p>
              </CardContent>
            </Card>
          ) : (
            <ReportCard
              grades={grades}
              studentName={profile?.full_name}
              admissionNumber={profile?.username || undefined}
              className={undefined} // class name not in profile — acceptable
              gender={profile?.gender || undefined}
              age={getAge(profile?.date_of_birth)}
              term={terms.find(t => t.id === selectedTerm)?.name}
              session={selectedSession}
              schoolName={schoolName}
              schoolLogoUrl={logoUrl || undefined}
              schoolAddress={schoolAddress || undefined}
              schoolContact={schoolContact || undefined}
              timesSchoolOpened={timesSchoolOpened}
              timesPresent={metadata?.times_present}
              timesAbsent={metadata?.times_absent}
              timesPunctual={metadata?.times_punctual}
              classPosition={metadata?.class_position}
              totalStudents={metadata?.total_students}
              classTeacherComment={metadata?.class_teacher_comment}
              principalComment={metadata?.principal_comment}
              reopeningDate={metadata?.reopening_date}
              psychomotor={psychomotor}
              affective={affective}
              classAverages={classAverages}
              showPrintButton
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
