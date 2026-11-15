// src/pages/student/StudentExams.tsx
// The student's list of exams: open now, coming up, completed (with score) and closed.
// MCQ exams open the CBT screen; theory exams open the question paper.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock, FileQuestion, FileText, Loader2, PlayCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import InAppCbtGate from "@/components/InAppCbtGate";
import { PASS_PERCENT, formatDateTime, percent } from "@/lib/exams";

interface StudentExam {
  id: string; title: string; description: string | null; exam_type: "mcq" | "theory"; duration_minutes: number;
  start_date: string | null; end_date: string | null; allow_retake: boolean; is_published: boolean;
  subjects: { name: string } | null;
}
interface MyAttempt { id: string; exam_id: string; is_submitted: boolean; score: number | null; total_questions: number | null }

export default function StudentExams() {
  return (
    <InAppCbtGate>
      <StudentExamsInner />
    </InAppCbtGate>
  );
}

function StudentExamsInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<StudentExam[]>([]);
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const userId = user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    const db = supabase as any;
    const [examRes, attRes] = await Promise.all([
      db.from("exams")
        .select("id, title, description, exam_type, duration_minutes, start_date, end_date, allow_retake, is_published, subjects(name)")
        .order("created_at", { ascending: false }),
      db.from("exam_attempts").select("id, exam_id, is_submitted, score, total_questions").eq("student_id", userId),
    ]);
    setExams((examRes.data as StudentExam[]) || []);
    setAttempts((attRes.data as MyAttempt[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const groups = useMemo(() => {
    const byExam = new Map(attempts.map((a) => [a.exam_id, a]));
    const open: StudentExam[] = [], upcoming: StudentExam[] = [], done: StudentExam[] = [], closed: StudentExam[] = [];
    for (const e of exams) {
      const att = byExam.get(e.id);
      if (!e.is_published && !att) continue;
      const started = !e.start_date || now >= new Date(e.start_date).getTime();
      const ended = !!e.end_date && now > new Date(e.end_date).getTime();
      if (att?.is_submitted) done.push(e);
      else if (att && !att.is_submitted) open.push(e);                 // mid-exam: always resumable
      else if (!started) upcoming.push(e);
      else if (ended) closed.push(e);
      else open.push(e);
    }
    return { open, upcoming, done, closed, byExam };
  }, [exams, attempts, now]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const go = (e: StudentExam) => navigate(e.exam_type === "theory" ? `/student/theory-exam/${e.id}` : `/student/exam/${e.id}`);

  const card = (e: StudentExam, kind: "open" | "upcoming" | "done" | "closed") => {
    const att = groups.byExam.get(e.id);
    const inProgress = att && !att.is_submitted;
    const pct = percent(att?.score, att?.total_questions);
    return (
      <Card key={e.id} className="border-0 shadow-md">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{e.title}</h3>
              <p className="text-sm text-muted-foreground">{e.subjects?.name || "—"}</p>
            </div>
            <Badge variant="outline">{e.exam_type === "theory" ? "Theory paper" : "Multiple choice"}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{e.duration_minutes} min</span>
            {e.start_date && <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />Opens {formatDateTime(e.start_date)}</span>}
            {e.end_date && <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />Closes {formatDateTime(e.end_date)}</span>}
          </div>
          {kind === "done" && att && (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Score: <b>{att.score ?? 0} / {att.total_questions ?? 0}</b> ({pct}%)
              <Badge variant={pct >= PASS_PERCENT ? "default" : "destructive"}>{pct >= PASS_PERCENT ? "Pass" : "Fail"}</Badge>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {kind === "open" && (
              <Button onClick={() => go(e)}>
                {e.exam_type === "theory" ? <><FileText className="mr-2 h-4 w-4" />View question paper</>
                  : inProgress ? <><PlayCircle className="mr-2 h-4 w-4" />Continue exam</>
                  : <><PlayCircle className="mr-2 h-4 w-4" />Start exam</>}
              </Button>
            )}
            {kind === "done" && (
              <Button variant="outline" onClick={() => go(e)}>
                {e.allow_retake ? <><RotateCcw className="mr-2 h-4 w-4" />View result / retake</> : "View result"}
              </Button>
            )}
            {kind === "upcoming" && <Badge variant="secondary">Not open yet</Badge>}
            {kind === "closed" && <Badge variant="secondary">Closed</Badge>}
          </div>
        </CardContent>
      </Card>
    );
  };

  const section = (title: string, list: StudentExam[], kind: "open" | "upcoming" | "done" | "closed") =>
    list.length === 0 ? null : (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {list.map((e) => card(e, kind))}
      </section>
    );

  const empty = groups.open.length + groups.upcoming.length + groups.done.length + groups.closed.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Exams</h1>
        <p className="text-muted-foreground">Exams set for your class by your teachers.</p>
      </div>
      {empty && (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <FileQuestion className="h-9 w-9 opacity-50" />
          <p className="font-medium">No exams yet</p>
          <p className="text-sm">When a teacher publishes an exam for your class, it will appear here.</p>
        </CardContent></Card>
      )}
      {section("Available now", groups.open, "open")}
      {section("Coming up", groups.upcoming, "upcoming")}
      {section("Completed", groups.done, "done")}
      {section("Closed", groups.closed, "closed")}
    </div>
  );
}
