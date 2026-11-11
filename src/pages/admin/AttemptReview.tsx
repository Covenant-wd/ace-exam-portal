// src/pages/admin/AttemptReview.tsx
// Opened from Results → "View Answers". Shows one student's attempt question by question:
// what they chose, what the correct answer was, and the score. Shared by admins and teachers
// (a teacher only reaches attempts of their own subject + class — the database decides).
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, MinusCircle, RotateCcw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PASS_PERCENT, type McqQuestion, formatDateTime, friendlyExamError, percent } from "@/lib/exams";

const LETTERS = ["A", "B", "C", "D"] as const;
const optKey = (l: string) => `option_${l.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d";

interface Attempt {
  id: string; exam_id: string; student_id: string; score: number | null; total_questions: number | null;
  is_submitted: boolean; started_at: string; submitted_at: string | null; violations: number | null;
  exams: { id: string; title: string; subjects: { name: string } | null } | null;
}

export default function AttemptReview() {
  const { attemptId = "" } = useParams<{ attemptId: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const base = role === "instructor" ? "/instructor" : "/admin";
  const db = supabase as any;

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [studentName, setStudentName] = useState("");
  const [className, setClassName] = useState("");
  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: a } = await db
      .from("exam_attempts")
      .select("*, exams(id, title, subjects(name))")
      .eq("id", attemptId)
      .maybeSingle();
    if (!a) { setAttempt(null); setLoading(false); return; }
    setAttempt(a as Attempt);

    const [qRes, ansRes, nameRes] = await Promise.all([
      db.from("questions").select("*").eq("exam_id", a.exam_id).order("question_order").order("created_at"),
      db.from("student_answers").select("question_id, selected_option").eq("attempt_id", attemptId),
      db.rpc("get_exam_result_students", { _exam_id: a.exam_id }),
    ]);
    setQuestions((qRes.data as McqQuestion[]) || []);
    const map: Record<string, string | null> = {};
    ((ansRes.data as any[]) || []).forEach((r) => { map[r.question_id] = r.selected_option; });
    setPicked(map);
    const me = ((nameRes.data as any[]) || []).find((s) => s.user_id === a.student_id);
    setStudentName(me?.full_name || "Student");
    setClassName(me?.class_name || "");
    setLoading(false);
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const allowRetake = async () => {
    if (!attempt) return;
    setBusy(true);
    const { error } = await db.from("exam_attempts").delete().eq("id", attempt.id);
    setBusy(false);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success("Attempt cleared — the student can take the exam again");
    navigate(`${base}/results?exam=${attempt.exam_id}`);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!attempt) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">This attempt wasn't found, or you don't have access to it.</p>
        <Button onClick={() => navigate(`${base}/results`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to results</Button>
      </CardContent></Card>
    );
  }

  const pct = percent(attempt.score, attempt.total_questions);
  const pass = pct >= PASS_PERCENT;
  const answered = questions.filter((q) => picked[q.id]).length;

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(`${base}/results?exam=${attempt.exam_id}`)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />Back to results
        </Button>
        <h1 className="text-2xl font-bold">{studentName}</h1>
        <p className="text-sm text-muted-foreground">
          {attempt.exams?.title}{attempt.exams?.subjects?.name ? ` · ${attempt.exams.subjects.name}` : ""}{className ? ` · ${className}` : ""}
        </p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <div>
            <p className="text-4xl font-extrabold">{attempt.score ?? 0} / {attempt.total_questions ?? questions.length}</p>
            <p className="text-sm text-muted-foreground">{pct}%</p>
          </div>
          <Badge variant={attempt.is_submitted ? (pass ? "default" : "destructive") : "secondary"}>
            {attempt.is_submitted ? (pass ? "Pass" : "Fail") : "In progress"}
          </Badge>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Started</dt><dd>{formatDateTime(attempt.started_at)}</dd>
            <dt className="text-muted-foreground">Submitted</dt><dd>{formatDateTime(attempt.submitted_at)}</dd>
            <dt className="text-muted-foreground">Answered</dt><dd>{answered} of {questions.length}</dd>
            <dt className="text-muted-foreground">Screen-leave warnings</dt><dd>{attempt.violations ?? 0}</dd>
          </dl>
          <Button variant="outline" className="ml-auto" onClick={() => setResetOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />Allow retake
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {questions.map((q, i) => {
          const chosen = (picked[q.id] || "").toUpperCase();
          const correct = (q.correct_option || "").toUpperCase();
          const state = !chosen ? "blank" : chosen === correct ? "right" : "wrong";
          return (
            <Card key={q.id} className="border-0 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {state === "right" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Correct" />}
                  {state === "wrong" && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-label="Wrong" />}
                  {state === "blank" && <MinusCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Not answered" />}
                  <p className="flex-1 whitespace-pre-wrap break-words font-medium"><span className="mr-1 text-muted-foreground">{i + 1}.</span>{q.question_text}</p>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {LETTERS.map((l) => {
                    const isCorrect = correct === l;
                    const isChosen = chosen === l;
                    return (
                      <div key={l} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                        isCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
                        isChosen && !isCorrect && "border-red-500 bg-red-50 dark:bg-red-500/10")}>
                        <span className="font-bold">{l}.</span>
                        <span className="flex-1 break-words">{q[optKey(l)]}</span>
                        {isChosen && <span className="text-xs font-semibold text-muted-foreground">Student's answer</span>}
                        {isCorrect && !isChosen && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Correct answer</span>}
                      </div>
                    );
                  })}
                </div>
                {state === "blank" && <p className="text-xs text-muted-foreground">The student left this question unanswered.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allow {studentName} to retake?</DialogTitle>
            <DialogDescription>
              This deletes their current attempt and score for this exam so they can take it again. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void allowRetake()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Clear attempt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
