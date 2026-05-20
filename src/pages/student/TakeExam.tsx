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

type ErrorType = "RLS_POLICY" | "RATE_LIMITED" | "NETWORK" | "TIMEOUT" | "UNKNOWN";

interface SubmissionResult {
  success: boolean;
  data?: any;       // payload returned by the operation on success
  error?: string;
  errorType?: ErrorType;
}

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Exam data
  const [exam, setExam]           = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers]     = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [flagged, setFlagged]     = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const [timeLeft, setTimeLeft]   = useState(0);
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
  const [examStarted, setExamStarted]       = useState(false);
  const violationsRef = useRef(0);
  const maxViolationsRef = useRef(3);
  const submittedRef  = useRef(false);
  const schoolNameRef = useRef("");
  const questionsRef = useRef<Question[]>([]);
  const submitExamRef = useRef<(isTimeout?: boolean, isCheating?: boolean) => Promise<void>>();

  const isIOS = useRef(
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
     (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );

  // ── SUBMISSION HELPER: Exponential Backoff with Error Classification ────
  /**
   * Executes an async operation with exponential backoff retry logic.
   * Classifies errors (RLS, rate-limit, network) to guide retry strategy.
   * RLS errors are non-retryable and return immediately.
   * Network/transient errors retry with 1s, 2s, 4s delays.
   */
  const submitWithExponentialBackoff = useCallback(
    async (
      operation: () => Promise<any>,
      operationName: string,
      maxRetries = 3
    ): Promise<SubmissionResult> => {
      let lastError: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await operation();
          if (attempt > 0) {
            console.log(`[TakeExam] ${operationName} succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
          }
          return { success: true, data: result };
        } catch (error: any) {
          lastError = error;

          // Classify error type
          const errorMessage = error?.message?.toLowerCase() || "";
          const errorCode = error?.code || "";

          const isRLSError = 
            errorMessage.includes("policy") ||
            errorMessage.includes("permission") ||
            errorCode === "42501" || // PostgreSQL permission denied
            errorCode === "42000"; // General permission denied
          
          const isRateLimited = 
            errorMessage.includes("429") ||
            errorMessage.includes("too many requests") ||
            errorMessage.includes("rate");
          
          const isNetworkError = 
            errorMessage.includes("fetch") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("network") ||
            errorMessage.includes("econnrefused") ||
            errorMessage.includes("enotfound") ||
            errorMessage.includes("schema cache") ||   // PostgREST restart — transient
            errorMessage.includes("failed to fetch");  // generic browser fetch failure

          const isTimeoutError =
            errorMessage.includes("timeout") ||
            errorCode === "ETIMEDOUT";

          const errorType: ErrorType = isRLSError ? "RLS_POLICY" :
                                       isRateLimited ? "RATE_LIMITED" :
                                       isTimeoutError ? "TIMEOUT" :
                                       isNetworkError ? "NETWORK" : "UNKNOWN";

          console.error(
            `[TakeExam] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
            {
              errorType,
              message: error?.message,
              code: error?.code,
              originalError: error,
            }
          );

          // RLS policy errors are non-retryable — admin action needed
          if (isRLSError) {
            return {
              success: false,
              error: "Your school's exam permissions are not configured correctly. Please contact your school administrator.",
              errorType: "RLS_POLICY",
            };
          }

          // Rate limit errors: back off exponentially
          if (isRateLimited && attempt < maxRetries) {
            const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(`[TakeExam] Rate limited. Retrying in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          // Network/timeout errors: moderate backoff
          if ((isNetworkError || isTimeoutError) && attempt < maxRetries) {
            const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`[TakeExam] Network error. Retrying in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          // Other errors or max retries reached: give up
          if (attempt < maxRetries) {
            const delayMs = 1000;
            console.log(`[TakeExam] ${operationName} error. Retrying in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }

      return {
        success: false,
        error: `Failed after ${maxRetries + 1} attempts. ${lastError?.message || "Unknown error"}. Please check your connection and try again.`,
        errorType: "UNKNOWN",
      };
    },
    []
  );

  // ── INIT ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !examId) return;

    const init = async () => {
      console.log("[TakeExam] init() — examId:", examId, "userId:", user.id);

      const { data: existing } = await supabase.from("exam_attempts")
        .select("*").eq("exam_id", examId).eq("student_id", user.id).maybeSingle();

      const [examRes, qRes] = await Promise.all([
        supabase.from("exams").select("*").eq("id", examId).single(),
        supabase.from("questions")
          .select("id, question_text, option_a, option_b, option_c, option_d, question_order")
          .eq("exam_id", examId).order("question_order"),
      ]);

      if (!examRes.data) {
        console.error("[TakeExam] Exam not found:", examId);
        navigate("/student");
        return;
      }
      setExam(examRes.data);
      const loadedQuestions = qRes.data ?? [];
      setQuestions(loadedQuestions);
      questionsRef.current = loadedQuestions;

      const { data: profileData } = await supabase
        .from("profiles").select("full_name, school_id").eq("user_id", user.id).single();
      if (profileData?.full_name) setStudentName(profileData.full_name);

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
          schoolNameRef.current = schoolRes.data.name;
        }
        if (settingRes.data?.value) {
          const mv = parseInt(settingRes.data.value) || 3;
          setMaxViolations(mv);
          maxViolationsRef.current = mv;
        }
        if (logoRes.data?.value) setSchoolLogo(logoRes.data.value);
      }

      const { data: subjectData } = await supabase.from("subjects")
        .select("allow_calculator" as any).eq("id", examRes.data.subject_id).single();
      if (subjectData && (subjectData as any).allow_calculator) setAllowCalculator(true);

      if (existing?.is_submitted) {
        if (!examRes.data.allow_retake) {
          toast.info("You've already completed this exam.");
          navigate("/student");
          return;
        }
        console.log("[TakeExam] Retake requested — calling reset_exam_attempt RPC");
        const { data: newAttemptId, error: retakeErr } = await supabase
          .rpc("reset_exam_attempt", { _exam_id: examId, _student_id: user.id });
        if (retakeErr || !newAttemptId) {
          console.error("[TakeExam] reset_exam_attempt failed:", retakeErr?.message, "| data:", newAttemptId);
          toast.error("Failed to start retake. Please try again.");
          navigate("/student/exams");
          return;
        }
        console.log("[TakeExam] Retake attempt created:", newAttemptId);
        setAttemptId(newAttemptId);
        attemptIdRef.current = newAttemptId;
        setAnswers({}); setFlagged(new Set()); setCurrentIndex(0);
        const retakeSecs = examRes.data.duration_minutes * 60;
        deadlineRef.current = Date.now() + retakeSecs * 1000;
        setTimeLeft(retakeSecs);
        setLoading(false); setExamStarted(true);
        return;
      }

      if (existing && !existing.is_submitted) {
        console.log("[TakeExam] Resuming attempt:", existing.id);
        setAttemptId(existing.id);
        attemptIdRef.current = existing.id;
        const elapsed = (Date.now() - new Date(existing.started_at).getTime()) / 1000;
        const remaining = Math.floor(Math.max(0, examRes.data.duration_minutes * 60 - elapsed));
        deadlineRef.current = Date.now() + remaining * 1000;
        setTimeLeft(remaining);
        const { data: savedAnswers } = await supabase.from("student_answers")
          .select("question_id, selected_option").eq("attempt_id", existing.id);
        const map: Record<string, string> = {};
        (savedAnswers ?? []).forEach((a: any) => { if (a.selected_option) map[a.question_id] = a.selected_option; });
        console.log("[TakeExam] Restored", Object.keys(map).length, "saved answers");
        answersRef.current = map;
        setAnswers(map);
      } else {
        console.log("[TakeExam] Creating new attempt for exam:", examId);
        const { data: attempt, error: attemptErr } = await supabase
          .from("exam_attempts").insert({ exam_id: examId, student_id: user.id }).select().single();
        if (attemptErr || !attempt) {
          console.error("[TakeExam] Failed to create attempt:", attemptErr?.message);
          toast.error("Failed to start exam. Please try again.");
          navigate("/student/exams");
          return;
        }
        console.log("[TakeExam] New attempt created:", attempt.id);
        setAttemptId(attempt.id);
        attemptIdRef.current = attempt.id;
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
  const handleViolation = useCallback((reason: string) => {
    if (submittedRef.current) return;
    violationsRef.current += 1;
    const newCount = violationsRef.current;
    console.warn("[TakeExam] VIOLATION #" + newCount + ":", reason);
    setViolations(newCount);
    setWarningReason(reason);
    if (newCount >= maxViolationsRef.current) {
      setWarningOpen(true);
      submitExamRef.current?.(false, true);
    } else {
      setWarningOpen(true);
    }
  }, []);

  // ── FULLSCREEN ───────────────────────────────────────────────────
  const fsEnterTimeRef = useRef<number>(0);

  const enterFullscreen = useCallback(() => {
    if (isIOS.current) return;
    fsEnterTimeRef.current = Date.now();
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    else if ((el as any).mozRequestFullScreen) (el as any).mozRequestFullScreen();
  }, []);

  useEffect(() => {
    if (!examStarted) return;
    if (isIOS.current) return;
    enterFullscreen();

    const handleFSChange = () => {
      const inFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(inFS);
      const msSinceEnter = Date.now() - fsEnterTimeRef.current;
      if (!inFS && !submittedRef.current && msSinceEnter > 1000) {
        console.warn("[TakeExam] Fullscreen exited");
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

    const lastViolationTimeRef = { current: 0 };
    const DEDUP_MS = 1000;

    const handleVisibility = () => {
      if (document.hidden && !submittedRef.current) {
        const now = Date.now();
        if (now - lastViolationTimeRef.current > DEDUP_MS) {
          lastViolationTimeRef.current = now;
          console.warn("[TakeExam] visibilitychange: tab hidden");
          handleViolation("You switched tabs or minimized the window.");
        }
      }
    };

    const handleWindowBlur = () => {
      if (!submittedRef.current) {
        const now = Date.now();
        if (now - lastViolationTimeRef.current > DEDUP_MS) {
          lastViolationTimeRef.current = now;
          console.warn("[TakeExam] window blur: focus left exam window");
          handleViolation("You left the exam window.");
        }
      }
    };

    const blockContext = (e: MouseEvent) => { e.preventDefault(); };

    const blockKeys = (e: KeyboardEvent) => {
      const blocked = (
        e.key === "F12" ||
        (e.ctrlKey && ["c","v","a","p","u","s"].includes(e.key.toLowerCase())) ||
        (e.ctrlKey && e.shiftKey && ["i","j","c"].includes(e.key.toLowerCase())) ||
        (e.altKey && e.key === "Tab")
      );
      if (blocked) { e.preventDefault(); e.stopPropagation(); }
    };

    const blockCopy = (e: ClipboardEvent) => { e.preventDefault(); };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("cut", blockCopy);

    console.log("[TakeExam] Anti-cheat listeners registered (visibilitychange + window blur + fullscreenchange)");

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("cut", blockCopy);
    };
  }, [examStarted, handleViolation]);

  // ── SUBMIT ───────────────────────────────────────────────────────
  /**
   * Complete exam submission with atomic two-phase commit:
   * 1. Save all answers first (with exponential backoff)
   * 2. Mark exam as submitted (best-effort; answers already saved)
   *
   * Errors are classified to guide user messaging:
   * - RLS policy errors require admin intervention (non-retryable)
   * - Network/timeout errors retry with exponential backoff
   * - Partial failures (answers saved, submission flag failed) are still success
   *
   * Manual submission is idempotent: second call while already submitted is a no-op.
   * Timeout submission bypasses manual submission guards.
   */
  const submitExam = useCallback(async (isTimeout = false, isCheating = false) => {
    const currentAttemptId = attemptIdRef.current;

    // Idempotency: allow timeout to re-submit if initial submission timed out
    if (submittedRef.current && !isTimeout) {
      console.warn("[TakeExam] submitExam called but already submitted. Skipping.");
      return;
    }

    if (!currentAttemptId) {
      console.error("[TakeExam] No attemptId. Submission aborted.");
      setSubmitting(false);
      toast.error("Submission failed: attempt ID not set. Please refresh the page and try again.");
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);
    setWarningOpen(false);

    console.log("[TakeExam] submitExam() — attemptId:", currentAttemptId,
      "| isTimeout:", isTimeout, "| isCheating:", isCheating);

    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});

    try {
      const currentQuestions = questionsRef.current;
      const currentAnswers = answersRef.current;

      if (!currentQuestions || currentQuestions.length === 0) {
        throw new Error("Questions not loaded");
      }

      console.log("[TakeExam] Total questions:", currentQuestions.length);

      // ──────────────────────────────────────────────────────────────
      // STEP 1: Fetch correct answers
      // ──────────────────────────────────────────────────────────────
      const { success: correctSuccess, error: correctError, data: correctResult } =
        await submitWithExponentialBackoff(
          async () => {
            const { data, error } = await supabase.from("questions")
              .select("id, correct_option").eq("exam_id", examId!);
            if (error) throw error;
            return data;   // returned as result.data in SubmissionResult
          },
          "Fetch correct answers",
          3
        );

      if (!correctSuccess) {
        throw new Error(`Cannot fetch answers: ${correctError}`);
      }

      const correctMap: Record<string, string> = {};
      ((correctResult as any[]) ?? []).forEach((q: any) => {
        correctMap[q.id] = q.correct_option;
      });

      // ──────────────────────────────────────────────────────────────
      // STEP 2: Prepare answer rows (only answered questions)
      // ──────────────────────────────────────────────────────────────
      const answeredRows = currentQuestions
        .filter((q) => {
          const a = currentAnswers[q.id];
          return typeof a === "string" && a.trim() !== "";
        })
        .map((q) => {
          const picked = currentAnswers[q.id].trim().toUpperCase();
          const correct = (correctMap[q.id] || "").trim().toUpperCase();
          return {
            attempt_id: currentAttemptId,
            question_id: q.id,
            selected_option: picked,
            is_correct: picked === correct,
          };
        });

      console.log("[TakeExam] Answered:", answeredRows.length, "of", currentQuestions.length);

      // ──────────────────────────────────────────────────────────────
      // STEP 3: Save all answers with exponential backoff
      // ──────────────────────────────────────────────────────────────
      if (answeredRows.length > 0) {
        const { success: answerSuccess, error: answerError } =
          await submitWithExponentialBackoff(
            async () => {
              const { error } = await supabase
                .from("student_answers")
                .upsert(answeredRows, { onConflict: "attempt_id,question_id" });
              if (error) throw error;
              return { success: true };
            },
            "Save student answers",
            3
          );

        if (!answerSuccess) {
          submittedRef.current = false;
          setSubmitting(false);
          toast.error(
            `Failed to save your answers: ${answerError}\n\nPlease check your connection and try submitting again.`,
            { duration: 8000 }
          );
          return;
        }

        console.log("[TakeExam] student_answers saved successfully.");
      }

      // ──────────────────────────────────────────────────────────────
      // STEP 4: Mark attempt as submitted (atomic)
      // ──────────────────────────────────────────────────────────────
      const score = answeredRows.filter((a) => a.is_correct).length;
      console.log("[TakeExam] Score:", score, "/", currentQuestions.length);

      const attemptUpdate = {
        is_submitted: true,
        score,
        total_questions: currentQuestions.length,
        submitted_at: new Date().toISOString(),
        // violations omitted: column does not exist in exam_attempts (confirmed via types.ts)
      };

      const { success: updateSuccess, error: updateError } =
        await submitWithExponentialBackoff(
          async () => {
            const { error } = await supabase
              .from("exam_attempts")
              .update(attemptUpdate)
              .eq("id", currentAttemptId);
            if (error) throw error;
            return { success: true };
          },
          "Mark exam as submitted",
          3
        );

      if (!updateSuccess) {
        // Answers are already saved — this is recoverable
        console.warn(
          "[TakeExam] Failed to mark exam as submitted (answers saved):",
          updateError
        );
        toast.warning(
          "Your answers have been saved. Your submission is being finalized. You can view your results shortly.",
          { duration: 6000 }
        );
      } else {
        console.log("[TakeExam] exam_attempts updated successfully.");
      }

      // ──────────────────────────────────────────────────────────────
      // STEP 5: User feedback
      // ──────────────────────────────────────────────────────────────
      if (isCheating) {
        toast.error("Exam terminated due to repeated violations.");
      } else {
        toast.success(
          isTimeout
            ? "Time's up! Your exam has been submitted."
            : "Exam submitted successfully!"
        );
      }

      // ──────────────────────────────────────────────────────────────
      // STEP 6: Send result email (non-blocking)
      // ──────────────────────────────────────────────────────────────
      try {
        const { data: examData, error: examDataErr } = await supabase
          .from("exams").select("title, school_id").eq("id", examId!).single();

        if (!examDataErr && examData) {
          const notifEnabled = examData.school_id
            ? await isNotificationEnabled(examData.school_id, "notify_exam_result")
            : true;

          if (notifEnabled) {
            const { data: profile } = await supabase
              .from("profiles").select("full_name").eq("user_id", user!.id).single();

            const displayName = profile?.full_name || studentName || "Student";
            const emails: string[] = [];

            try {
              const { data: studentEmail } = await supabase.rpc("get_email_by_user_id", { _user_id: user!.id });
              if (studentEmail) emails.push(studentEmail);
            } catch (e) {
              console.warn("[TakeExam] Could not fetch student email:", e);
            }

            try {
              const { data: parentLinks } = await supabase
                .from("parent_students").select("parent_id").eq("student_id", user!.id);
              if (parentLinks?.length > 0) {
                const parentIds = parentLinks.map((p: any) => p.parent_id);
                const { data: parentEmails } = await supabase.rpc("get_user_emails_by_ids", { _user_ids: parentIds });
                (parentEmails || []).forEach((r: any) => { if (r.email) emails.push(r.email); });
              }
            } catch (e) {
              console.warn("[TakeExam] Could not fetch parent emails:", e);
            }

            if (emails.length > 0) {
              const sent = await sendExamResultEmail({
                to: emails,
                recipientName: displayName,
                studentName: displayName,
                schoolName: schoolNameRef.current || schoolName || "School",
                examTitle: examData.title,
                score,
                totalQuestions: currentQuestions.length,
                loginUrl: window.location.origin,
              });
              if (!sent) console.warn("[TakeExam] sendExamResultEmail reported failure.");
            }
          }
        }
      } catch (emailErr: any) {
        console.warn("[TakeExam] Email notification error (non-fatal):", emailErr?.message ?? emailErr);
      }

      // ──────────────────────────────────────────────────────────────
      // SUCCESS: Navigate to results
      // ──────────────────────────────────────────────────────────────
      navigate("/student/results");

    } catch (fatalError: any) {
      console.error("[TakeExam] FATAL submission error:", fatalError);
      submittedRef.current = false;
      setSubmitting(false);
      toast.error(
        `Submission error: ${fatalError?.message || "Unknown error"}\n\nPlease try again or contact your school for support.`,
        { duration: 8000 }
      );
    }
  }, [examId, navigate, schoolName, user, submitWithExponentialBackoff]);

  submitExamRef.current = submitExam;

  // ── TIMER ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || deadlineRef.current <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(interval);
        setTimeLeft(0);
        console.log("[TakeExam] Timer expired — auto-submitting.");
        submitExamRef.current?.(true);
      } else {
        setTimeLeft(remaining);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  // ── SELECT ANSWER ────────────────────────────────────────────────
  /**
   * Answer selection is optimistic (UI updates immediately).
   * Saves to DB in background with exponential backoff.
   * Non-blocking: if save fails, the final submission will re-save all answers.
   */
  const selectAnswer = async (questionId: string, option: string) => {
    if (submittedRef.current) return;

    // Optimistic update: UI reflects answer immediately
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: option };
      answersRef.current = next;
      return next;
    });

    // Background save with limited retries (don't block student)
    const currentAttemptId = attemptIdRef.current;
    if (!currentAttemptId) {
      console.warn("[TakeExam] selectAnswer: no attemptId yet");
      return;
    }

    const { success, error } = await submitWithExponentialBackoff(
      async () => {
        const { error } = await supabase.from("student_answers").upsert({
          attempt_id: currentAttemptId,
          question_id: questionId,
          selected_option: option,
        }, { onConflict: "attempt_id,question_id" });
        if (error) throw error;
        return { success: true };
      },
      `Answer save (Q${questionId})`,
      1 // only 1 retry for real-time saves (don't block student)
    );

    if (!success) {
      console.warn(`[TakeExam] Background answer save failed (will retry on submit): ${error}`);
    }
  };

  const toggleFlag = (qId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="text-lg font-medium text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Failed to load exam. Please try again.</p>
            <Button onClick={() => navigate("/student")} className="mt-4 w-full">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQ = questions[currentIndex] || questions[0];
  const optionLabels = ["A", "B", "C", "D"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            {schoolLogo && (
              <img src={schoolLogo} alt="School Logo" className="h-10 w-auto" />
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">{schoolName || "School"}</p>
              <p className="text-base font-semibold">{exam.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{studentName || "Student"}</span>
            </div>

            <div className="flex items-center gap-4">
              {violations > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {violations}/{maxViolations}
                  </span>
                </div>
              )}

              <div className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 font-mono",
                timeLeft > 600
                  ? "bg-emerald-500/10 text-emerald-700"
                  : timeLeft > 180
                  ? "bg-amber-500/10 text-amber-700"
                  : "bg-destructive/10 text-destructive"
              )}>
                <Clock className="h-4 w-4" />
                <span className="text-sm font-bold">
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                </span>
              </div>

              {allowCalculator && (
                <Button variant="outline" size="sm" onClick={() => setShowCalculator(!showCalculator)}>
                  <CalcIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Violation Warning Dialog */}
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {violations >= maxViolations ? "Exam Terminated" : "Violation Warning"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{warningReason}</p>
            {violations < maxViolations && (
              <p className="text-sm font-medium">
                Violations: {violations}/{maxViolations}
              </p>
            )}
            {violations >= maxViolations && (
              <p className="text-sm font-medium text-destructive">
                Your exam has been automatically submitted due to multiple violations.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            {violations < maxViolations && (
              <AlertDialogCancel>Continue Exam</AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calculator */}
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
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Exam"
                        )}
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
                        <AlertDialogAction onClick={() => submitExam(false)} disabled={submitting}>
                          {submitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            "Submit"
                          )}
                        </AlertDialogAction>
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
