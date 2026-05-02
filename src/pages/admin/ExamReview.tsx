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
  User, BookOpen, Trophy, Clock,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReviewQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  /** Always uppercase — from questions table */
  correct_option: string;
  question_order: number;

  // ── Answer data (from student_answers) ────────────────────────────────────
  /**
   * The option letter the student picked (uppercase), or null.
   *
   * IMPORTANT: This field is nullable in the DB and may be null even when
   * the student answered.  This can happen when:
   *   • The real-time selectAnswer upsert ran but the final submit upsert
   *     fired with stale/empty state and overwrote selected_option with null.
   *   • A network error caused the submit upsert to only partially succeed.
   *
   * Never use this field alone to determine pass/fail status.
   * Use `answer_status` instead.
   */
  selected_option: string | null;

  /** Whether the student_answers row exists for this question. */
  has_answer_row: boolean;

  /**
   * The DB value of is_correct (may be null if the submit upsert didn't run).
   * Used as a fallback when selected_option is missing.
   */
  db_is_correct: boolean | null;

  /**
   * Resolved status — the single source of truth used for all UI rendering.
   *   "correct"  — student answered and got it right
   *   "wrong"    — student answered and got it wrong
   *   "skipped"  — no answer recorded at all
   */
  answer_status: "correct" | "wrong" | "skipped";
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper — resolve answer_status from all available signals
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Normalise a raw answer value before comparison.
//   • Converts to string so numeric indices (0,1,2…) don't cause type mismatches
//   • Trims whitespace   ("A " → "A")
//   • Uppercases          ("a"  → "A")
//   • Returns null for every "empty" value (null, undefined, "")
// ─────────────────────────────────────────────────────────────────────────────
function normaliseAnswer(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  return s === "" ? null : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED resolveStatus — single source of truth for per-question classification
// ─────────────────────────────────────────────────────────────────────────────
function resolveStatus(
  selected: string | null,
  correctOption: string,
  dbIsCorrect: boolean | null,
  hasRow: boolean,
): "correct" | "wrong" | "skipped" {
  const normSelected = normaliseAnswer(selected);
  const normCorrect  = normaliseAnswer(correctOption);

  // 1. No student_answers row at all → student definitively did NOT answer.
  //    With the fixed submitExam, skipped questions are guaranteed to have no row.
  if (!hasRow) return "skipped";

  // 2. We have a clean selected answer — compare against the correct option.
  //    This is the primary path now that submitExam never inserts null rows.
  if (normSelected !== null) {
    return normSelected === normCorrect ? "correct" : "wrong";
  }

  // 3. Edge case: a row exists but selected_option is null. This should no
  //    longer happen with the fixed submitExam, but we handle legacy/partial
  //    data defensively. Trust is_correct when present; otherwise treat as
  //    wrong (the row's existence proves the student engaged with the question)
  //    rather than skipped — so we never silently misclassify a real attempt.
  if (dbIsCorrect !== null) {
    return dbIsCorrect ? "correct" : "wrong";
  }

  // 4. Row exists but both selected_option and is_correct are null — corrupt
  //    legacy data. Mark as wrong (not skipped) since a row was created.
  return "wrong";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
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

    // Access guard
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

        // 2. Verify the exam belongs to this school (security)
        const { data: exam } = await supabase
          .from("exams")
          .select("id, title, school_id, subjects(name)")
          .eq("id", attempt.exam_id)
          .single();

        if (!exam || exam.school_id !== schoolId) {
          setAccessDenied(true); setLoading(false); return;
        }

        // 3. Student profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, class_name")
          .eq("user_id", attempt.student_id)
          .single();

        // 4. All questions for this exam (with correct_option)
        const { data: rawQuestions } = await supabase
          .from("questions")
          .select("id, question_text, option_a, option_b, option_c, option_d, correct_option, question_order")
          .eq("exam_id", attempt.exam_id)
          .order("question_order");

        // 5. Student's answer rows for this attempt.
        //    We select is_correct as well so we can use it as a fallback when
        //    selected_option is null (stale-state submit bug).
        const { data: studentAnswers, error: answersErr } = await supabase
          .from("student_answers")
          .select("question_id, selected_option, is_correct")
          .eq("attempt_id", attemptId!);

        if (answersErr) {
          console.error("[ExamReview] failed to load student_answers:", answersErr.message);
        }
        console.log("[ExamReview] loaded answers:", {
          attemptId,
          rows: studentAnswers?.length ?? 0,
          sample: studentAnswers?.slice(0, 3),
        });

        // Build lookup: question_id → answer row.
        // Normalise keys to plain strings to defeat any UUID/object key quirks.
        const answerMap = new Map<string, { question_id: string; selected_option: string | null; is_correct: boolean | null }>();
        for (const a of studentAnswers ?? []) {
          if (a?.question_id) answerMap.set(String(a.question_id), a as any);
        }

        // Merge questions with answers
        const merged: ReviewQuestion[] = (rawQuestions ?? []).map((q: any) => {
          const ans = answerMap.get(String(q.id));
          const hasRow = ans !== undefined;

          // FIXED: use normaliseAnswer() for consistent trim+uppercase+null handling
          const selected    = normaliseAnswer(ans?.selected_option);
          const correctNorm = normaliseAnswer(q.correct_option) ?? "";
          const dbIsCorrect = ans?.is_correct ?? null;

          const answer_status = resolveStatus(selected, correctNorm, dbIsCorrect, hasRow);

          return {
            id: q.id,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: correctNorm,
            question_order: q.question_order,
            selected_option: selected,
            has_answer_row: hasRow,
            db_is_correct: dbIsCorrect,
            answer_status,
          };
        });

        console.log("[ExamReview] merged statuses:", merged.map(m => ({
          q: m.question_order, status: m.answer_status, sel: m.selected_option, correct: m.correct_option, hasRow: m.has_answer_row
        })));

        // Use stored score from exam_attempts as the authoritative score.
        // Fall back to counting resolved "correct" statuses only when score is null.
        const localScore = merged.filter((q) => q.answer_status === "correct").length;

        setMeta({
          student_name:    profile?.full_name ?? "Unknown Student",
          class_name:      profile?.class_name ?? "—",
          exam_title:      exam.title,
          subject_name:    (exam.subjects as any)?.name ?? "—",
          score:           attempt.score ?? localScore,
          total_questions: attempt.total_questions ?? merged.length,
          submitted_at:    attempt.submitted_at,
        });

        setQuestions(merged);


      } finally {
        setLoading(false);
      }
    };

    load();
  }, [attemptId, schoolId, role, permissions, permLoading]);

  // ── Loading / error states ───────────────────────────────────────────────
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

  // ── Derived counts ───────────────────────────────────────────────────────
  const correct = questions.filter((q) => q.answer_status === "correct").length;
  const wrong   = questions.filter((q) => q.answer_status === "wrong").length;
  const skipped = questions.filter((q) => q.answer_status === "skipped").length;

  const pct = meta.total_questions
    ? Math.round(((meta.score ?? 0) / meta.total_questions) * 100)
    : 0;

  const submittedAt = meta.submitted_at
    ? new Date(meta.submitted_at).toLocaleString()
    : "—";

  // ── Render ───────────────────────────────────────────────────────────────
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

      {/* ── Header card ─────────────────────────────────────────────────── */}
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

      {/* ── Summary strip ───────────────────────────────────────────────── */}
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

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="font-medium text-muted-foreground">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
          Correct — student's pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
          Correct answer (not picked)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          Student's wrong pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" />
          Not selected
        </span>
      </div>

      {/* ── Question cards ───────────────────────────────────────────────── */}
      <div className="space-y-5">
        {questions.map((q, i) => {
          const { answer_status, selected_option, correct_option } = q;

          const cardBorder =
            answer_status === "correct" ? "border-l-4 border-l-emerald-500"
            : answer_status === "wrong"   ? "border-l-4 border-l-red-500"
            :                              "border-l-4 border-l-slate-300 dark:border-l-slate-600";

          const statusIcon =
            answer_status === "correct" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            : answer_status === "wrong"   ? <XCircle       className="h-5 w-5 text-red-500" />
            :                              <MinusCircle    className="h-5 w-5 text-slate-400" />;

          return (
            <Card key={q.id} className={`border-0 shadow-md ${cardBorder}`}>
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
                    const optionKey  = `option_${label.toLowerCase()}` as keyof ReviewQuestion;
                    const optionText = q[optionKey] as string;

                    const isCorrectOption = correct_option === label;
                    // FIX: when selected_option is null (stale-submit data-loss) but
                    // answer_status is "correct", we know the student picked the correct
                    // option — infer the pick so the admin sees it highlighted properly.
                    const inferredPick =
                      selected_option !== null
                        ? selected_option          // normal path: use stored value
                        : answer_status === "correct"
                          ? correct_option         // fallback: student must have picked correct
                          : null;                  // wrong but we don't know which option
                    const isStudentPick = inferredPick === label;

                    let bgClass  = "bg-muted/40 border-muted";
                    let labelBg  = "bg-muted text-muted-foreground";
                    let indicator: React.ReactNode = null;

                    if (isCorrectOption && isStudentPick) {
                      // Student picked the correct option (amber = correct pick)
                      bgClass  = "bg-amber-50 border-amber-400 dark:bg-amber-950/40";
                      labelBg  = "bg-amber-400 text-white";
                      indicator = <CheckCircle2 className="ml-auto h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
                    } else if (isCorrectOption) {
                      // Correct answer — student skipped or got it wrong (green = right answer not chosen)
                      bgClass  = "bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40";
                      labelBg  = "bg-emerald-500 text-white";
                      indicator = <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600 shrink-0" />;
                    } else if (isStudentPick) {
                      // Student picked this wrong option (red = wrong pick)
                      bgClass  = "bg-red-50 border-red-400 dark:bg-red-950/40";
                      labelBg  = "bg-red-500 text-white";
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

                {/* ── Status footnotes ────────────────────────────────────── */}

                {/* Student genuinely skipped */}
                {answer_status === "skipped" && (
                  <p className="mt-3 text-xs text-muted-foreground italic">
                    ⚠ Student did not answer this question.
                    The correct answer is <strong>{correct_option}</strong>.
                  </p>
                )}

                {/*
                  Data-loss notice: we know the outcome (correct/wrong) from is_correct,
                  but selected_option is null so we cannot show which option was picked.
                  This happens when TakeExam's submit upsert fired with stale state
                  and overwrote selected_option with null.
                */}
                {answer_status !== "skipped" && selected_option === null && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 italic">
                    ⚠ The specific option the student chose could not be retrieved.
                    The answer was recorded as{" "}
                    <strong>{answer_status === "correct" ? "correct ✓" : "incorrect ✗"}</strong>.
                    The correct answer is <strong>{correct_option}</strong>.
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
