import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sendExamResultEmail, isNotificationEnabled } from "@/lib/email";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Clock, Flag, ChevronLeft, ChevronRight, AlertTriangle, Calculator as CalcIcon, ShieldAlert, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import Calculator from "@/components/Calculator";
import RichContentRenderer from "@/components/RichContentRenderer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  question_order: number;
}

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Exam data
  const [exam, setExam]           = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers]     = useState<Record<string, string>>({});
  const [flagged, setFlagged]     = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft]   = useState(0);
  // Stores the absolute deadline as a Unix timestamp (ms).
  // Used by the timer to compute remaining time accurately without drift.
  const deadlineRef = useRef<number>(0);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [allowCalculator, setAllowCalculator] = useState(false);
  const [showCalculator, setShowCalculator]   = useState(false);

  // Header info
  const [studentName, setStudentName] = useState("");
  const [schoolName, setSchoolName]   = useState("");
  const [schoolLogo, setSchoolLogo]   = useState("");

  // Anti-cheat
  const [violations, setViolations]         = useState(0);
  const [maxViolations, setMaxViolations]   = useState(3);
  const [warningOpen, setWarningOpen]       = useState(false);
  const [warningReason, setWarningReason]   = useState("");
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [examStarted, setExamStarted]       = useState(false); // true once exam loads
  const violationsRef = useRef(0);
  const maxViolationsRef = useRef(3);
  const submittedRef  = useRef(false);
  // BUG FIX: schoolName is loaded async. submitExam is a useCallback that captures
  // schoolName at creation time — if the exam auto-submits on timeout before
  // schoolName has loaded, the email gets "School" instead of the real name.
  // A ref always reflects the latest value regardless of when submitExam was memoized.
  const schoolNameRef = useRef("");

  // iOS Safari does not support the Fullscreen API at all. Attempting
  // requestFullscreen() on iOS throws or silently fails, and fullscreenchange
  // never fires — so students would get phantom violations. We skip fullscreen
  // entirely on iOS; visibilitychange anti-cheat still works normally.
  const isIOS = useRef(
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
     (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );

  // ── INIT ────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: existing } = await supabase.from("exam_attempts")
        .select("*").eq("exam_id", examId!).eq("student_id", user!.id).maybeSingle();

      const [examRes, qRes] = await Promise.all([
        supabase.from("exams").select("*").eq("id", examId!).single(),
        supabase.from("questions")
          .select("id, question_text, option_a, option_b, option_c, option_d, question_order")
          .eq("exam_id", examId!).order("question_order"),
      ]);

      if (!examRes.data) { navigate("/student"); return; }
      setExam(examRes.data);
      setQuestions(qRes.data ?? []);

      // Fetch student name
      const { data: profileData } = await supabase
        .from("profiles").select("full_name, school_id").eq("user_id", user!.id).single();
      if (profileData?.full_name) setStudentName(profileData.full_name);

      // Fetch school name, logo + max violations setting
      if (profileData?.school_id) {
        const [schoolRes, settingRes, logoRes] = await Promise.all([
          supabase.from("schools").select("name").eq("id", profileData.school_id).single(),
          supabase.from("school_settings")
            .select("value").eq("school_id", profileData.school_id)
            .eq("key", "max_exam_violations").maybeSingle(),
          supabase.from("school_settings")
            .select("value").eq("school_id", profileData.school_id)
            .eq("key", "school_logo_url").maybeSingle(),
        ]);
        if (schoolRes.data?.name) {
          setSchoolName(schoolRes.data.name);
          schoolNameRef.current = schoolRes.data.name; // keep ref in sync for submitExam closure
        }
        if (settingRes.data?.value) {
          const mv = parseInt(settingRes.data.value) || 3;
          setMaxViolations(mv);
          maxViolationsRef.current = mv;
        }
        if (logoRes.data?.value) setSchoolLogo(logoRes.data.value);
      }

      // Calculator check
      const { data: subjectData } = await supabase.from("subjects")
        .select("allow_calculator" as any).eq("id", examRes.data.subject_id).single();
      if (subjectData && (subjectData as any).allow_calculator) setAllowCalculator(true);

      // Handle attempt state
      if (existing?.is_submitted) {
        if (!examRes.data.allow_retake) {
          toast.info("You've already completed this exam.");
          navigate("/student"); return;
        }
        const { data: newAttemptId, error: retakeErr } = await supabase
          .rpc("reset_exam_attempt", { _exam_id: examId!, _student_id: user!.id });
        if (retakeErr || !newAttemptId) {
          toast.error("Failed to start retake. Please try again.");
          navigate("/student/exams"); return;
        }
        setAttemptId(newAttemptId);
        setAnswers({}); setFlagged(new Set()); setCurrentIndex(0);
        const retakeSecs = examRes.data.duration_minutes * 60;
        deadlineRef.current = Date.now() + retakeSecs * 1000;
        setTimeLeft(retakeSecs);
        setLoading(false); setExamStarted(true); return;
      }

      if (existing && !existing.is_submitted) {
        setAttemptId(existing.id);
        const elapsed = (Date.now() - new Date(existing.started_at).getTime()) / 1000;
        const remaining = Math.floor(Math.max(0, examRes.data.duration_minutes * 60 - elapsed));
        deadlineRef.current = Date.now() + remaining * 1000;
        setTimeLeft(remaining);
        const { data: savedAnswers } = await supabase.from("student_answers")
          .select("question_id, selected_option").eq("attempt_id", existing.id);
        const map: Record<string, string> = {};
        (savedAnswers ?? []).forEach((a: any) => { if (a.selected_option) map[a.question_id] = a.selected_option; });
        setAnswers(map);
      } else {
        const { data: attempt, error: attemptErr } = await supabase
          .from("exam_attempts").insert({ exam_id: examId!, student_id: user!.id }).select().single();
        if (attemptErr || !attempt) {
          toast.error("Failed to start exam. Please try again.");
          navigate("/student/exams"); return;
        }
        setAttemptId(attempt.id);
        const secs = examRes.data.duration_minutes * 60;
        deadlineRef.current = Date.now() + secs * 1000;
        setTimeLeft(secs);
      }

      setLoading(false);
      setExamStarted(true);
    };
    init();
  }, [examId, user, navigate]);

  // ── VIOLATION HANDLER ────────────────────────────────────────────
  // Defined BEFORE any useEffect that references it so closures always
  // capture the live function reference (not undefined).
  const handleViolation = useCallback((reason: string) => {
    if (submittedRef.current) return;
    violationsRef.current += 1;
    const newCount = violationsRef.current;
    setViolations(newCount);
    setWarningReason(reason);
    setWarningOpen(true);
  }, []);

  // ── FULLSCREEN ───────────────────────────────────────────────────
  // Brief cooldown after enterFullscreen() so the resulting focus events
  // don't immediately retrigger the violation handler.
  const fsEnterTimeRef = useRef<number>(0);

  const enterFullscreen = useCallback(() => {
    if (isIOS.current) return; // Fullscreen API unsupported on iOS
    fsEnterTimeRef.current = Date.now();
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    else if ((el as any).mozRequestFullScreen) (el as any).mozRequestFullScreen();
  }, []);

  useEffect(() => {
    if (!examStarted) return;
    if (isIOS.current) return; // iOS doesn't support fullscreen
    enterFullscreen();

    const handleFSChange = () => {
      const inFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(inFS);
      // Ignore fullscreen-exit events that happen within 1 s of us calling
      // enterFullscreen() (browser fires exit before the new enter completes)
      const msSinceEnter = Date.now() - fsEnterTimeRef.current;
      if (!inFS && !submittedRef.current && msSinceEnter > 1000) {
        handleViolation("You exited fullscreen mode.");
      }
    };

    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
    };
  }, [examStarted, enterFullscreen, handleViolation]);

  // ── ANTI-CHEAT LISTENERS ─────────────────────────────────────────
  useEffect(() => {
    if (!examStarted) return;

    // ── Tab / window visibility ───────────────────────────────────
    // We use ONLY visibilitychange (not window "blur") to detect tab switching.
    // Reason: on every tab switch the browser fires BOTH visibilitychange AND
    // window blur — using both would count every switch as TWO violations.
    // visibilitychange alone is sufficient and more reliable.
    const handleVisibility = () => {
      if (document.hidden && !submittedRef.current) {
        handleViolation("You switched tabs or minimized the window.");
      }
    };

    // Block right-click
    const blockContext = (e: MouseEvent) => { e.preventDefault(); };

    // Block keyboard shortcuts
    const blockKeys = (e: KeyboardEvent) => {
      const blocked = (
        e.key === "F12" ||
        (e.ctrlKey && ["c","v","a","p","u","s"].includes(e.key.toLowerCase())) ||
        (e.ctrlKey && e.shiftKey && ["i","j","c"].includes(e.key.toLowerCase())) ||
        (e.altKey && e.key === "Tab")
      );
      if (blocked) { e.preventDefault(); e.stopPropagation(); }
    };

    // Block copy/paste/cut
    const blockCopy = (e: ClipboardEvent) => { e.preventDefault(); };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("cut", blockCopy);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("cut", blockCopy);
    };
  }, [examStarted, handleViolation]);

  // ── SUBMIT ───────────────────────────────────────────────────────
  const submitExam = useCallback(async (isTimeout = false, isCheating = false) => {
    if (submittedRef.current || !attemptId) return;
    submittedRef.current = true;
    setSubmitting(true);
    setWarningOpen(false);

    // Exit fullscreen on submit
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});

    const { data: correctData } = await supabase.from("questions")
      .select("id, correct_option").eq("exam_id", examId!);
    const correctMap: Record<string, string> = {};
    (correctData ?? []).forEach((q: any) => { correctMap[q.id] = q.correct_option; });

    // CRITICAL FIX: Only upsert rows for questions the student actually answered.
    // Previously we upserted a row for EVERY question (with selected_option=null
    // for un-answered ones). That blanked-out any prior row written by
    // selectAnswer if the local `answers` state was stale (e.g. resumed attempt
    // where the saved answers hadn't fully rehydrated). It also made truly
    // skipped questions indistinguishable from wrong ones (both is_correct=false).
    //
    // New rule: a student_answers row exists ⇔ the student selected an option.
    // Skipped questions have NO row at all. ExamReview can then trust hasRow
    // as the definitive "did they answer?" signal.
    const answeredRows = questions
      .filter((q) => {
        const a = answers[q.id];
        return typeof a === "string" && a.trim() !== "";
      })
      .map((q) => {
        const picked = answers[q.id].trim().toUpperCase();
        const correct = (correctMap[q.id] || "").trim().toUpperCase();
        return {
          attempt_id: attemptId,
          question_id: q.id,
          selected_option: picked,
          is_correct: picked === correct,
        };
      });

    if (answeredRows.length > 0) {
      // Retry once on failure to mitigate transient network/RLS errors.
      const { error: upsertErr } = await supabase
        .from("student_answers")
        .upsert(answeredRows, { onConflict: "attempt_id,question_id" });

      if (upsertErr) {
        await new Promise((r) => setTimeout(r, 1000));
        const { error: retryErr } = await supabase
          .from("student_answers")
          .upsert(answeredRows, { onConflict: "attempt_id,question_id" });
        if (retryErr) {
          console.error("[TakeExam] student_answers upsert failed after retry:", retryErr.message);
        }
      }
    }

    const score = answeredRows.filter((a) => a.is_correct).length;

    await supabase.from("exam_attempts").update({
      is_submitted: true,
      score,
      total_questions: questions.length,
      submitted_at: new Date().toISOString(),
      violations: violationsRef.current,
    } as any).eq("id", attemptId);

    if (isCheating) {
      toast.error("Exam terminated due to repeated violations.");
    } else {
      toast.success(isTimeout ? "Time's up! Exam submitted." : "Exam submitted successfully!");
    }

    try {
      const { data: examData } = await supabase.from("exams").select("title, school_id").eq("id", examId!).single();
      const notifEnabled = examData?.school_id ? await isNotificationEnabled(examData.school_id, "notify_exam_result") : true;
      if (!notifEnabled) throw new Error("skip");
      const { data: profile } = await supabase.from("profiles").select("full_name, school_id").eq("user_id", user!.id).single();
      const { data: userAuth } = await supabase.rpc("get_email_by_user_id", { _user_id: user!.id });
      const emails: string[] = [];
      if (userAuth) emails.push(userAuth);
      const { data: parentLinks } = await supabase.from("parent_students").select("parent_id").eq("student_id", user!.id);
      if (parentLinks && parentLinks.length > 0) {
        const parentIds = parentLinks.map((p: any) => p.parent_id);
        const { data: parentEmails } = await supabase.rpc("get_user_emails_by_ids", { _user_ids: parentIds });
        (parentEmails || []).forEach((r: any) => { if (r.email) emails.push(r.email); });
      }
      if (emails.length > 0 && examData && profile) {
        await sendExamResultEmail({
          to: emails,
          recipientName: profile.full_name,
          studentName: profile.full_name,
          schoolName: schoolNameRef.current || schoolName || "School",
          examTitle: examData.title,
          score,
          totalQuestions: questions.length,
          loginUrl: window.location.origin,
        });
      }
    } catch {}

    navigate("/student/results");
  }, [attemptId, answers, questions, examId, navigate, schoolName, user]);

  // ── TIMER ────────────────────────────────────────────────────────
  // Uses deadline-based countdown (Date.now() diff) instead of decrementing
  // state by 1 every second. setInterval fires are never perfectly 1000 ms
  // apart — over a 60-minute exam the old approach could lose 5-15 seconds.
  useEffect(() => {
    if (loading || timeLeft <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(interval);
        setTimeLeft(0);
        submitExam(true);
      } else {
        setTimeLeft(remaining);
      }
    }, 500); // poll twice per second so display is always accurate
    return () => clearInterval(interval);
  }, [loading, submitExam]); // intentionally omit timeLeft — deadline drives it

  const selectAnswer = async (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    if (attemptId) {
      await supabase.from("student_answers").upsert({
        attempt_id: attemptId, question_id: questionId, selected_option: option,
      }, { onConflict: "attempt_id,question_id" });
    }
  };

  const toggleFlag = (qId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const currentQ  = questions[currentIndex];
  const minutes   = Math.floor(timeLeft / 60);
  const seconds   = timeLeft % 60;
  const isLowTime = timeLeft < 60;
  const optionLabels = ["A", "B", "C", "D"] as const;
  const willAutoSubmit = violations >= maxViolations;

  return (
    <div
      className="min-h-screen bg-background select-none"
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
      onPaste={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── VIOLATION WARNING MODAL ── */}
      {warningOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border-2 border-destructive bg-background p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-destructive">
                  {willAutoSubmit ? "Exam Terminated" : `Warning ${violations} of ${maxViolations}`}
                </h2>
                <p className="text-sm text-muted-foreground">Anti-Cheat System</p>
              </div>
            </div>

            <p className="mb-2 text-sm font-medium">{warningReason}</p>

            {willAutoSubmit ? (
              <p className="mb-6 text-sm text-destructive font-semibold">
                You have reached the maximum number of violations. Your exam is being submitted now.
              </p>
            ) : (
              <p className="mb-6 text-sm text-muted-foreground">
                You have <strong>{maxViolations - violations}</strong> warning(s) remaining before your exam is automatically submitted.
              </p>
            )}

            <div className="flex gap-2">
              {!willAutoSubmit ? (
                <Button
                  className="flex-1"
                  onClick={() => {
                    setWarningOpen(false);
                    enterFullscreen();
                  }}
                >
                  Return to Exam
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => submitExam(false, true)}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Now"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TOP HEADER BAR ── */}
      <div className="sticky top-0 z-10 border-b bg-card shadow-sm">
        {/* Row 1: School + Student + Timer */}
        <div className="flex items-center justify-between px-4 py-2.5">
          {/* School name + logo */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 overflow-hidden border border-primary/20">
              {schoolLogo
                ? <img src={schoolLogo} alt="School logo" className="h-full w-full object-contain p-0.5" />
                : <GraduationCap className="h-4 w-4 text-primary" />}
            </div>
            <span className="font-semibold text-sm truncate">{schoolName || "Academia HQ"}</span>
          </div>

          {/* Student name — center */}
          <div className="hidden sm:flex items-center gap-2 px-4">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {studentName ? studentName.charAt(0).toUpperCase() : "S"}
              </span>
            </div>
            <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{studentName}</span>
          </div>

          {/* Right: violations + calculator + timer */}
          <div className="flex items-center gap-2">
            {/* Violation indicator */}
            {violations > 0 && (
              <div className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-bold text-destructive">{violations}/{maxViolations}</span>
              </div>
            )}

            {allowCalculator && (
              <Button variant={showCalculator ? "default" : "outline"} size="sm"
                onClick={() => setShowCalculator(!showCalculator)}>
                <CalcIcon className="mr-1 h-4 w-4" />Calculator
              </Button>
            )}

            <div className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono font-bold",
              isLowTime ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted"
            )}>
              <Clock className="h-4 w-4" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </div>
        </div>

        {/* Row 2: Exam title + student name on mobile */}
        <div className="border-t bg-muted/40 px-4 py-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground truncate">{exam?.title}</p>
          {/* Student name on mobile */}
          <span className="sm:hidden text-xs text-muted-foreground truncate shrink-0 ml-2">
            {studentName}
          </span>
        </div>
      </div>

      {/* Floating calculator */}
      {showCalculator && allowCalculator && (
        <div className="fixed right-4 top-24 z-20">
          <Calculator onClose={() => setShowCalculator(false)} />
        </div>
      )}

      <div className="mx-auto flex max-w-4xl gap-4 p-4">
        {/* Question navigator (desktop) */}
        <div className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-24">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Questions
            </p>
            {/* 5-column grid: rows of 1-5, 6-10, 11-15 ... */}
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(i)}
                  title={`Question ${i + 1}${flagged.has(q.id) ? " (flagged)" : ""}`}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                    currentIndex === i
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : answers[q.id]
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                    flagged.has(q.id) && "ring-2 ring-amber-400"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Mini legend */}
            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
                Current
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
                Answered
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-muted ring-2 ring-amber-400" />
                Flagged
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-muted" />
                Unanswered
              </div>
            </div>
          </div>
        </div>

        {/* Question card */}
        <div className="flex-1">
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
                  {currentIndex + 1}
                </span>
                of {questions.length}
              </CardTitle>
              <Button variant={flagged.has(currentQ.id) ? "default" : "outline"} size="sm"
                onClick={() => toggleFlag(currentQ.id)}>
                <Flag className="mr-1 h-4 w-4" />{flagged.has(currentQ.id) ? "Flagged" : "Flag"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6 text-lg font-medium">
                <RichContentRenderer content={currentQ.question_text} />
              </div>
              <div className="space-y-3">
                {optionLabels.map((l) => {
                  const selected = answers[currentQ.id] === l;
                  return (
                    <button key={l} onClick={() => selectAnswer(currentQ.id, l)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
                        selected ? "border-primary bg-primary/10 font-medium"
                          : "border-border hover:border-primary/50 hover:bg-muted"
                      )}>
                      <span className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        {l}
                      </span>
                      <RichContentRenderer content={(currentQ as any)[`option_${l.toLowerCase()}`]} />
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline" disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Previous
                </Button>
                {currentIndex < questions.length - 1 ? (
                  <Button onClick={() => setCurrentIndex((i) => i + 1)}>
                    Next<ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="default" disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Exam"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-accent" />Submit Exam?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          You've answered {Object.keys(answers).length} of {questions.length} questions.
                          {flagged.size > 0 && ` ${flagged.size} question(s) are flagged for review.`}
                          {" "}This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Continue Exam</AlertDialogCancel>
                        <AlertDialogAction onClick={() => submitExam(false)}>Submit</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mobile question navigator */}
          <div className="mt-4 lg:hidden">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Questions
            </p>
            <div className="grid grid-cols-10 gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(i)}
                  title={`Question ${i + 1}${flagged.has(q.id) ? " (flagged)" : ""}`}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                    currentIndex === i
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : answers[q.id]
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                    flagged.has(q.id) && "ring-2 ring-amber-400"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
