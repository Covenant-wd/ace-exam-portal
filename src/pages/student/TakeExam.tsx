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
        if (schoolRes.data?.name) setSchoolName(schoolRes.data.name);
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
        setTimeLeft(examRes.data.duration_minutes * 60);
        setLoading(false); setExamStarted(true); return;
      }

      if (existing && !existing.is_submitted) {
        setAttemptId(existing.id);
        const elapsed = (Date.now() - new Date(existing.started_at).getTime()) / 1000;
        setTimeLeft(Math.floor(Math.max(0, examRes.data.duration_minutes * 60 - elapsed)));
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
        setTimeLeft(examRes.data.duration_minutes * 60);
      }

      setLoading(false);
      setExamStarted(true);
    };
    init();
  }, [examId, user, navigate]);

  // ── FULLSCREEN ───────────────────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    else if ((el as any).mozRequestFullScreen) (el as any).mozRequestFullScreen();
  }, []);

  useEffect(() => {
    if (!examStarted) return;
    // Enter fullscreen when exam loads
    enterFullscreen();

    const handleFSChange = () => {
      const inFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(inFS);
      if (!inFS && examStarted && !submittedRef.current) {
        handleViolation("You exited fullscreen mode.");
      }
    };

    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
    };
  }, [examStarted, enterFullscreen]);

  // ── ANTI-CHEAT LISTENERS ─────────────────────────────────────────
  useEffect(() => {
    if (!examStarted) return;

    // Tab visibility change
    const handleVisibility = () => {
      if (document.hidden && !submittedRef.current) {
        handleViolation("You switched tabs or minimized the window.");
      }
    };

    // Window blur (Alt+Tab, click outside)
    const handleBlur = () => {
      if (!submittedRef.current) {
        handleViolation("You left the exam window.");
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
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("cut", blockCopy);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("cut", blockCopy);
    };
  }, [examStarted]);

  // ── VIOLATION HANDLER ────────────────────────────────────────────
  const handleViolation = useCallback((reason: string) => {
    if (submittedRef.current) return;
    violationsRef.current += 1;
    const newCount = violationsRef.current;
    setViolations(newCount);
    setWarningReason(reason);
    setWarningOpen(true);

    if (newCount >= maxViolationsRef.current) {
      // Will auto-submit from the warning modal dismiss
    }
  }, []);

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

    const answerRows = questions.map((q) => ({
      attempt_id: attemptId,
      question_id: q.id,
      selected_option: answers[q.id] || null,
      is_correct: answers[q.id] ? answers[q.id] === correctMap[q.id] : false,
    }));

    if (answerRows.length > 0) {
      await supabase.from("student_answers").upsert(answerRows, { onConflict: "attempt_id,question_id" });
    }

    const score = answerRows.filter((a) => a.is_correct).length;

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
          schoolName: schoolName || "School",
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
  useEffect(() => {
    if (loading || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); submitExam(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, submitExam, timeLeft]);

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
        <div className="hidden w-20 shrink-0 lg:block">
          <div className="sticky top-24 space-y-2">
            {questions.map((q, i) => (
              <button key={q.id} onClick={() => setCurrentIndex(i)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                  currentIndex === i ? "bg-primary text-primary-foreground"
                    : answers[q.id] ? "bg-secondary text-secondary-foreground"
                    : "bg-muted text-muted-foreground",
                  flagged.has(q.id) && "ring-2 ring-accent"
                )}>
                {i + 1}
              </button>
            ))}
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
          <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
            {questions.map((q, i) => (
              <button key={q.id} onClick={() => setCurrentIndex(i)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium",
                  currentIndex === i ? "bg-primary text-primary-foreground"
                    : answers[q.id] ? "bg-secondary text-secondary-foreground"
                    : "bg-muted text-muted-foreground",
                  flagged.has(q.id) && "ring-2 ring-accent"
                )}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
