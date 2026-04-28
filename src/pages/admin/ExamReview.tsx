import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useInstructorPermissions } from "@/hooks/useInstructorPermissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RichContentRenderer from "@/components/RichContentRenderer";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, MinusCircle,
  User, BookOpen, Trophy, Clock, BarChart3
} from "lucide-react";

interface ReviewQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  question_order: number;
  // Raw value from student_answers — may be null if student skipped
  selected_option: string | null;
  // Computed locally (never trust the stored is_correct alone — it can be null
  // if the real-time selectAnswer upsert ran but submitExam upsert did not finish)
  is_correct: boolean;
  is_skipped: boolean;
}

interface AttemptMeta {
  student_name: string;
  class_name: string;
  exam_title: string;
  subject_name: string;
  score: number | null;
  total_questions: number | null;
  submitted_at: string | null;
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export default function ExamReview() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { role, schoolId } = useAuth();
  const { permissions, loading: permLoading } = useInstructorPermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/instructor") ? "/instructor" : "/admin";

  const [meta, setMeta] = useState<AttemptMeta | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (permLoading) return;

    if (role === "instructor") {
      const allowed = permissions?.can_manage_exams || permissions?.can_view_results;
      if (!allowed) { setAccessDenied(true); setLoading(false); return; }
    }

    const load = async () => {
      try {
        // 1. Load the attempt
        const { data: attempt, error: attemptErr } = await supabase
          .from("exam_attempts")
          .select("*")
          .eq("id", attemptId!)
          .single();

        if (attemptErr || !attempt) { setLoading(false); return; }

        // 2. Verify the exam belongs to this school
        const { data: exam } = await supabase
          .from("exams")
          .select("id, title, school_id, subjects(name)")
          .eq("id", attempt.exam_id)
          .single();

        if (!exam || exam.school_id !== schoolId) { setAccessDenied(true); setLoading(false); return; }

        // 3. Student profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, class_name")
          .eq("user_id", attempt.student_id)
          .single();

        // 4. Questions for this exam
        const { data: rawQuestions } = await supabase
          .from("questions")
          .select("id, question_text, option_a, option_b, option_c, option_d, correct_option, question_order")
          .eq("exam_id", attempt.exam_id)
          .order("question_order");

        // 5. Student answers for this attempt
        const { data: studentAnswers } = await supabase
          .from("student_answers")
          .select("question_id, selected_option, is_correct")
          .eq("attempt_id", attemptId!);

        // Build a map of question_id → answer row
        const answerMap = new Map(
          (studentAnswers ?? []).map((a) => [a.question_id, a])
        );

        // Merge questions with answers.
        // ── KEY FIX ──────────────────────────────────────────────────────────
        // We RECOMPUTE is_correct locally by comparing selected_option to
        // correct_option instead of relying on the stored is_correct column.
        // The stored value can be null when:
        //   • selectAnswer() saved the answer in real-time (no is_correct set)
        //   • A network hiccup caused the submitExam upsert to partially fail
        // Recomputing here ensures the review always shows the truth regardless
        // of what ended up in the database.
        // ─────────────────────────────────────────────────────────────────────
        const merged: ReviewQuestion[] = (rawQuestions ?? []).map((q: any) => {
          const ans = answerMap.get(q.id);
          const selected = ans?.selected_option ?? null;

          // Normalise to uppercase so "a" == "A" comparisons never fail
          const selectedNorm = selected?.toUpperCase() ?? null;
          const correctNorm  = (q.correct_option ?? "").toUpperCase();

          const is_skipped = selectedNorm === null;
          const is_correct = !is_skipped && selectedNorm === correctNorm;

          return {
            id: q.id,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: correctNorm,      // normalised
            question_order: q.question_order,
            selected_option: selectedNorm,    // normalised
            is_correct,
            is_skipped,
          };
        });

        // Recalculate score from local truth (more reliable than stored score)
        const recomputedScore = merged.filter((q) => q.is_correct).length;

        setMeta({
          student_name: profile?.full_name ?? "Unknown Student",
          class_name: profile?.class_name ?? "—",
          exam_title: exam.title,
          subject_name: (exam.subjects as any)?.name ?? "—",
          // Use stored score if available, otherwise use recomputed value
          score: attempt.score ?? recomputedScore,
          total_questions: attempt.total_questions ?? merged.length,
          submitted_at: attempt.submitted_at,
        });

        setQuestions(merged);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [attemptId, schoolId, role, permissions, permLoading]);

  if (loading || permLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You don't have permission to review exam submissions.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <MinusCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Attempt Not Found</h2>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  const pct = meta.total_questions
    ? Math.round(((meta.score ?? 0) / meta.total_questions) * 100)
    : 0;

  const correct = questions.filter((q) => q.is_correct).length;
  const wrong   = questions.filter((q) => !q.is_correct && !q.is_skipped).length;
  const skipped = questions.filter((q) => q.is_skipped).length;

  const submittedAt = meta.submitted_at
    ? new Date(meta.submitted_at).toLocaleString()
    : "—";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => navigate(`${basePath}/results`)}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Results
      </Button>

      {/* Header card */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-primary/90 to-primary px-6 py-5 text-primary-foreground">
          <h1 className="text-2xl font-bold">Exam Review</h1>
          <p className="mt-1 text-primary-foreground/80 text-sm">{meta.exam_title}</p>
        </div>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Student</p>
                <p className="font-semibold">{meta.student_name}</p>
                <p className="text-xs text-muted-foreground">{meta.class_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="font-semibold">{meta.subject_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="font-semibold">
                  {meta.score ?? 0}/{meta.total_questions ?? 0}
                  <span className="ml-2 text-sm text-muted-foreground">({pct}%)</span>
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="text-sm font-medium">{submittedAt}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 bg-emerald-50 shadow-sm dark:bg-emerald-950/30">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{correct}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">Correct</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-red-50 shadow-sm dark:bg-red-950/30">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-red-600">{wrong}</p>
              <p className="text-xs text-red-500">Wrong</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-slate-50 shadow-sm dark:bg-slate-900/40">
          <CardContent className="flex items-center gap-3 p-4">
            <MinusCircle className="h-8 w-8 text-slate-400" />
            <div>
              <p className="text-2xl font-bold text-slate-500">{skipped}</p>
              <p className="text-xs text-slate-400">Skipped</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="font-medium text-muted-foreground">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
          Correct (student's pick)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
          Correct Answer (not picked)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          Student's Wrong Pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" />
          Not Selected
        </span>
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {questions.map((q, i) => {
          const statusIcon = q.is_skipped
            ? <MinusCircle className="h-5 w-5 text-slate-400" />
            : q.is_correct
            ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            : <XCircle className="h-5 w-5 text-red-500" />;

          const cardBorder = q.is_skipped
            ? "border-l-4 border-l-slate-300 dark:border-l-slate-600"
            : q.is_correct
            ? "border-l-4 border-l-emerald-500"
            : "border-l-4 border-l-red-500";

          return (
            <Card key={q.id} className={`border-0 shadow-md transition-all ${cardBorder}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                <div className="flex items-start gap-3 flex-1">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="text-sm font-medium leading-relaxed">
                    <RichContentRenderer content={q.question_text} />
                  </div>
                </div>
                <div className="shrink-0">{statusIcon}</div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OPTION_LABELS.map((label) => {
                    const optionKey = `option_${label.toLowerCase()}` as keyof ReviewQuestion;
                    const optionText = q[optionKey] as string;

                    // Both comparisons use normalised uppercase values
                    const isCorrectOption  = q.correct_option  === label;
                    const isStudentPick    = q.selected_option === label;

                    let bgClass   = "bg-muted/40 border-muted";
                    let labelBg   = "bg-muted text-muted-foreground";
                    let indicator: React.ReactNode = null;

                    if (isCorrectOption && isStudentPick) {
                      // ✅ Student picked the right answer
                      bgClass   = "bg-amber-50 border-amber-400 dark:bg-amber-950/40";
                      labelBg   = "bg-amber-400 text-white";
                      indicator = <CheckCircle2 className="ml-auto h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
                    } else if (isCorrectOption) {
                      // ✅ This is the correct answer but student didn't pick it
                      bgClass   = "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40";
                      labelBg   = "bg-emerald-500 text-white";
                      indicator = <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600 shrink-0" />;
                    } else if (isStudentPick) {
                      // ❌ Student picked this wrong answer
                      bgClass   = "bg-red-50 border-red-400 dark:bg-red-950/40";
                      labelBg   = "bg-red-500 text-white";
                      indicator = <XCircle className="ml-auto h-4 w-4 text-red-500 shrink-0" />;
                    }

                    return (
                      <div
                        key={label}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${bgClass}`}
                      >
                        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${labelBg}`}>
                          {label}
                        </span>
                        <span className="flex-1 leading-snug">
                          <RichContentRenderer content={optionText} />
                        </span>
                        {indicator}
                      </div>
                    );
                  })}
                </div>

                {/* Skipped notice — shows the correct answer for context */}
                {q.is_skipped && (
                  <p className="mt-3 text-xs text-muted-foreground italic">
                    ⚠ Student did not answer this question.
                    The correct answer is <strong>{q.correct_option}</strong>.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {questions.length === 0 && (
        <Card className="border-0 shadow-md">
          <CardContent className="p-10 text-center text-muted-foreground">
            No questions found for this attempt.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
