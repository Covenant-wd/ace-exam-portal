// src/pages/student/TakeExam.tsx
// The student's CBT screen.
//
//  • Questions arrive WITHOUT their answers (server function start_exam_attempt).
//  • Every answer is autosaved to the server; a copy is also kept on this device.
//  • The countdown comes from the server's clock, not the device's.
//  • SUBMIT is grade-on-the-server and is built not to fail quietly:
//      - it sends every answer again with the submit,
//      - it retries automatically when the network drops,
//      - if it still cannot reach the server it shows a Retry screen and keeps the answers.
//  • Leaving the tab 3 times submits the exam automatically.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, Loader2,
  RotateCcw, Send, XCircle, WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PASS_PERCENT, formatClock, friendlyExamError, percent } from "@/lib/exams";
import ExamCalculator from "@/components/ExamCalculator";
import InAppCbtGate from "@/components/InAppCbtGate";

interface IntroData {
  state: "available" | "not_started" | "closed" | "no_questions" | "in_progress" | "expired" | "submitted";
  exam: {
    id: string; title: string; description: string | null; instructions: string | null;
    exam_type: "mcq" | "theory"; duration_minutes: number; start_date: string | null; end_date: string | null;
    allow_retake: boolean; subject_name: string | null; allow_calculator: boolean; question_count: number;
  };
  attempt: {
    id: string; is_submitted: boolean; score: number | null; total_questions: number | null;
    violations: number; remaining_seconds: number | null;
  } | null;
}

interface RunQuestion {
  id: string; question_text: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
}

interface RunData {
  attempt_id: string; remaining_seconds: number; violations: number; max_violations: number;
  exam: { id: string; title: string; instructions: string | null; duration_minutes: number; subject_name: string | null; allow_calculator: boolean };
  questions: RunQuestion[];
  answers: Record<string, string>;
}

interface ResultData { score: number; total_questions: number; auto?: "time" | "violations" | "expired" }

type Phase = "loading" | "error" | "intro" | "starting" | "running" | "submitting" | "submit_failed" | "result";

const LETTERS = ["A", "B", "C", "D"] as const;
const optionKey = (l: string) => `option_${l.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d";

const isNetworkError = (msg: string) => /failed to fetch|network|timeout|timed out|load failed|fetch|offline/i.test(msg);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

const storageKey = (attemptId: string) => `cbt-exam:${attemptId}`;
function readLocal(attemptId: string): { answers: Record<string, string>; flagged: Record<string, boolean> } {
  try {
    const raw = localStorage.getItem(storageKey(attemptId));
    if (!raw) return { answers: {}, flagged: {} };
    const p = JSON.parse(raw);
    return { answers: p.answers || {}, flagged: p.flagged || {} };
  } catch { return { answers: {}, flagged: {} }; }
}
function writeLocal(attemptId: string, answers: Record<string, string>, flagged: Record<string, boolean>) {
  try { localStorage.setItem(storageKey(attemptId), JSON.stringify({ answers, flagged })); } catch { /* storage full / blocked */ }
}
function clearLocal(attemptId: string) {
  try { localStorage.removeItem(storageKey(attemptId)); } catch { /* ignore */ }
}

export default function TakeExam() {
  return (
    <InAppCbtGate>
      <TakeExamInner />
    </InAppCbtGate>
  );
}

function TakeExamInner() {
  const { examId = "" } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [intro, setIntro] = useState<IntroData | null>(null);
  const [run, setRun] = useState<RunData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [result, setResult] = useState<ResultData | null>(null);
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Values the timers / event handlers need to read without going stale
  const answersRef = useRef<Record<string, string>>({});
  const flaggedRef = useRef<Record<string, boolean>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const attemptIdRef = useRef("");
  const endsAtRef = useRef(0);
  const submittingRef = useRef(false);
  const doneRef = useRef(false);
  const savingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef<Record<string, boolean>>({});
  const submitRef = useRef<(reason: "manual" | "time") => Promise<void>>(async () => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const maxViolations = run?.max_violations ?? 3;

  // ── Loading the instructions screen ───────────────────────────
  const loadIntro = useCallback(async () => {
    setPhase("loading");
    try {
      const { data, error } = await rpc("get_exam_intro", { _exam_id: examId });
      if (error) throw error;
      const d = data as IntroData;
      if (d.exam.exam_type === "theory") {
        navigate(`/student/theory-exam/${examId}`, { replace: true });
        return;
      }
      setIntro(d);
      if (d.state === "submitted" && d.attempt) {
        setResult({ score: d.attempt.score ?? 0, total_questions: d.attempt.total_questions ?? 0 });
        setPhase("result");
      } else {
        setPhase("intro");
      }
    } catch (e: any) {
      setErrorMsg(friendlyExamError(e?.message));
      setPhase("error");
    }
  }, [examId, navigate]);

  useEffect(() => { if (examId) void loadIntro(); }, [examId, loadIntro]);

  // ── Autosave ──────────────────────────────────────────────────
  const scheduleSave = useCallback((delay = 700) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushRef.current(); }, delay);
  }, []);

  const flushSave = useCallback(async () => {
    if (savingRef.current || doneRef.current || !attemptIdRef.current) return;
    if (dirtyRef.current.size === 0) return;
    savingRef.current = true;
    const ids = Array.from(dirtyRef.current);
    const payload: Record<string, string | null> = {};
    ids.forEach((id) => { payload[id] = answersRef.current[id] ?? null; });
    setSaveState("saving");
    try {
      const { error } = await rpc("save_exam_answers", { _attempt_id: attemptIdRef.current, _answers: payload });
      if (error) throw error;
      ids.forEach((id) => { if ((answersRef.current[id] ?? null) === payload[id]) dirtyRef.current.delete(id); });
      if (dirtyRef.current.size > 0) { setSaveState("saving"); scheduleSave(300); }
      else setSaveState("saved");
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/time is up|already been submitted|attempt not found/i.test(msg)) {
        // The exam is over on the server — finish it from here.
        setSaveState("idle");
        if (!doneRef.current) void submitRef.current("time");
      } else {
        setSaveState("offline");
        scheduleSave(5000); // try again shortly
      }
    } finally {
      savingRef.current = false;
    }
  }, [scheduleSave]);
  flushRef.current = flushSave;

  // ── Choosing / clearing an answer, flagging ───────────────────
  const choose = (qid: string, letter: string | null) => {
    const next = { ...answersRef.current };
    if (letter) next[qid] = letter; else delete next[qid];
    answersRef.current = next;
    setAnswers(next);
    dirtyRef.current.add(qid);
    writeLocal(attemptIdRef.current, next, flaggedRef.current);
    scheduleSave();
  };

  const toggleFlag = (qid: string) => {
    const next = { ...flaggedRef.current, [qid]: !flaggedRef.current[qid] };
    flaggedRef.current = next;
    setFlagged(next);
    writeLocal(attemptIdRef.current, answersRef.current, next);
  };

  // ── Starting / resuming ───────────────────────────────────────
  const startExam = useCallback(async () => {
    setPhase("starting");
    try {
      const { data, error } = await rpc("start_exam_attempt", { _exam_id: examId });
      if (error) throw error;

      if (data.status === "submitted") {
        setResult({ score: data.score ?? 0, total_questions: data.total_questions ?? 0, auto: data.expired ? "expired" : undefined });
        setPhase("result");
        return;
      }

      const d = data as RunData;
      attemptIdRef.current = d.attempt_id;

      // Server answers + anything this device remembers that the server may not have yet
      const local = readLocal(d.attempt_id);
      const merged = { ...(d.answers || {}), ...local.answers };
      dirtyRef.current = new Set(Object.keys(local.answers).filter((id) => (d.answers || {})[id] !== local.answers[id]));
      answersRef.current = merged;
      flaggedRef.current = local.flagged;
      endsAtRef.current = Date.now() + d.remaining_seconds * 1000;
      doneRef.current = false;
      submittingRef.current = false;
      warnedRef.current = {};

      setAnswers(merged);
      setFlagged(local.flagged);
      setRun(d);
      setViolations(d.violations || 0);
      setCurrent(0);
      setRemaining(d.remaining_seconds);
      setSaveState("idle");
      setPhase("running");
      if (dirtyRef.current.size > 0) scheduleSave(300);
    } catch (e: any) {
      toast.error(friendlyExamError(e?.message));
      setPhase("intro");
      void loadIntro();
    }
  }, [examId, loadIntro, scheduleSave]);

  const retake = async () => {
    if (!user) return;
    setPhase("starting");
    try {
      const { error } = await rpc("reset_exam_attempt", { _exam_id: examId, _student_id: user.id });
      if (error) throw error;
      setResult(null);
      await startExam();
    } catch (e: any) {
      toast.error(friendlyExamError(e?.message));
      void loadIntro();
    }
  };

  // ── Submitting ────────────────────────────────────────────────
  const submit = useCallback(async (reason: "manual" | "time") => {
    if (submittingRef.current || doneRef.current) return;
    submittingRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setConfirmOpen(false);
    setCalcOpen(false);
    setSubmitError("");
    setPhase("submitting");

    const payload = { ...answersRef.current };
    let lastError = "";

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { data, error } = await rpc("submit_exam_attempt", {
          _attempt_id: attemptIdRef.current,
          _answers: payload,
        });
        if (error) throw error;
        doneRef.current = true;
        clearLocal(attemptIdRef.current);
        setResult({
          score: data.score ?? 0,
          total_questions: data.total_questions ?? 0,
          auto: reason === "time" ? "time" : undefined,
        });
        setPhase("result");
        return;
      } catch (e: any) {
        lastError = e?.message || String(e);
        if (!isNetworkError(lastError)) break;          // a real error — retrying will not help
        if (attempt < 3) await sleep(1000 * 2 ** attempt); // wait 1s, 2s, 4s between the 4 tries
      }
    }

    // Could not submit. Nothing is lost: answers are autosaved and kept on this device.
    submittingRef.current = false;
    setSubmitError(friendlyExamError(lastError));
    setPhase("submit_failed");
  }, []);
  submitRef.current = submit;

  // ── Countdown (server time) ───────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 300 && rem > 60 && !warnedRef.current.five) { warnedRef.current.five = true; toast.warning("5 minutes left"); }
      if (rem <= 60 && rem > 0 && !warnedRef.current.one) { warnedRef.current.one = true; toast.warning("1 minute left — finish up!"); }
      if (rem <= 0) void submitRef.current("time");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Safety-net autosave + leave-page warning ──────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => { void flushRef.current(); }, 15000);
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", beforeUnload); };
  }, [phase]);

  // ── Anti-cheat: leaving the tab ───────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (away < 1500 || doneRef.current || submittingRef.current) return; // ignore quick flickers
      try {
        const { data, error } = await rpc("report_exam_violation", { _attempt_id: attemptIdRef.current });
        if (error) throw error;
        setViolations(data.violations);
        if (data.auto_submitted) {
          doneRef.current = true;
          clearLocal(attemptIdRef.current);
          setResult({ score: data.score ?? 0, total_questions: data.total_questions ?? 0, auto: "violations" });
          setPhase("result");
        } else {
          setWarning(`Warning ${data.violations} of ${data.max_violations}: you left the exam screen. After ${data.max_violations} warnings the exam is submitted automatically.`);
        }
      } catch { /* a missed warning must never disturb the exam */ }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  // ── Keyboard: A–D choose, ← → move ────────────────────────────
  useEffect(() => {
    if (phase !== "running" || !run) return;
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || warning) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const q = run.questions[current];
        if (q) choose(q.id, k);
      } else if (e.key === "ArrowRight") setCurrent((c) => Math.min(run.questions.length - 1, c + 1));
      else if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run, current, confirmOpen, warning]);

  // Clean up timers if the student leaves the page
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ── Derived numbers ───────────────────────────────────────────
  const total = run?.questions.length ?? 0;
  const answeredCount = useMemo(
    () => (run ? run.questions.filter((q) => answers[q.id]).length : 0),
    [run, answers],
  );
  const flaggedCount = useMemo(
    () => (run ? run.questions.filter((q) => flagged[q.id]).length : 0),
    [run, flagged],
  );

  // ═════════════════════════ RENDER ═════════════════════════
  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#f5f5f7] px-4 py-6 dark:bg-[#0f0f14]">{children}</div>
  );

  if (phase === "loading" || phase === "starting") {
    return shell(
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {phase === "starting" ? "Preparing your exam…" : "Loading…"}
      </div>,
    );
  }

  if (phase === "error") {
    return shell(
      <Card className="mx-auto mt-10 max-w-lg border-0 shadow-md">
        <CardContent className="space-y-4 py-10 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <p className="font-semibold">This exam can't be opened</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button onClick={() => navigate("/student/exams")}>Back to my exams</Button>
        </CardContent>
      </Card>,
    );
  }

  // ── Instructions ──────────────────────────────────────────────
  if (phase === "intro" && intro) {
    const e = intro.exam;
    const canStart = intro.state === "available" || intro.state === "in_progress" || intro.state === "expired";
    const stateMessage: Record<string, string> = {
      not_started: e.start_date ? `This exam opens on ${new Date(e.start_date).toLocaleString()}.` : "This exam has not started yet.",
      closed: "This exam is closed.",
      no_questions: "This exam has no questions yet. Please check back later.",
    };
    return shell(
      <Card className="mx-auto max-w-2xl border-0 shadow-md">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div>
            <h1 className="text-2xl font-bold">{e.title}</h1>
            <p className="text-muted-foreground">{e.subject_name || "Exam"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-3"><p className="text-2xl font-bold">{e.question_count}</p><p className="text-xs text-muted-foreground">Questions</p></div>
            <div className="rounded-xl bg-muted p-3"><p className="text-2xl font-bold">{e.duration_minutes}</p><p className="text-xs text-muted-foreground">Minutes</p></div>
            <div className="col-span-2 rounded-xl bg-muted p-3 sm:col-span-1"><p className="text-2xl font-bold">{e.allow_calculator ? "Yes" : "No"}</p><p className="text-xs text-muted-foreground">Calculator</p></div>
          </div>

          {e.description && <p className="whitespace-pre-wrap text-sm">{e.description}</p>}
          {e.instructions && (
            <div className="rounded-xl border bg-amber-50 p-4 text-sm dark:bg-amber-500/10">
              <p className="mb-1 font-semibold">Instructions from your teacher</p>
              <p className="whitespace-pre-wrap">{e.instructions}</p>
            </div>
          )}

          <div className="space-y-1.5 rounded-xl bg-muted/60 p-4 text-sm">
            <p className="font-semibold">Before you start</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>The timer starts as soon as you press Start and keeps running even if you close the page.</li>
              <li>Your answers are saved automatically as you go. You can change them until you submit.</li>
              <li>Do not leave this screen or switch tabs — after {3} warnings the exam is submitted automatically.</li>
              <li>The exam is submitted automatically when the time is up.</li>
            </ul>
          </div>

          {intro.state === "in_progress" && intro.attempt?.remaining_seconds != null && (
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
              You already started this exam — about <b>{formatClock(intro.attempt.remaining_seconds)}</b> remain. Your saved answers will be restored.
            </p>
          )}
          {intro.state === "expired" && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              The time for your attempt has ended. Press the button below to close it and see your score —
              the answers you saved will be marked.
            </p>
          )}
          {!canStart && stateMessage[intro.state] && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{stateMessage[intro.state]}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => navigate("/student/exams")}>Back</Button>
            <Button size="lg" disabled={!canStart} onClick={() => void startExam()}>
              {intro.state === "in_progress" ? "Continue exam" : intro.state === "expired" ? "See my result" : "Start exam"}
            </Button>
          </div>
        </CardContent>
      </Card>,
    );
  }

  // ── Result ────────────────────────────────────────────────────
  if (phase === "result" && result) {
    const pct = percent(result.score, result.total_questions);
    const pass = pct >= PASS_PERCENT;
    const reason =
      result.auto === "time" ? "Your time ran out, so the exam was submitted automatically."
      : result.auto === "violations" ? "The exam was submitted automatically because you left the exam screen too many times."
      : result.auto === "expired" ? "Your time had already run out, so the exam was closed with the answers you saved."
      : null;
    return shell(
      <Card className="mx-auto mt-6 max-w-lg border-0 shadow-md" data-testid="exam-result">
        <CardContent className="space-y-5 py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Exam submitted</h1>
            <p className="text-muted-foreground">{intro?.exam.title ?? run?.exam.title}</p>
          </div>
          <div>
            <p className="text-5xl font-extrabold" data-testid="score-line">{result.score} / {result.total_questions}</p>
            <p className="mt-1 text-lg text-muted-foreground">{pct}%</p>
            <Badge className="mt-2" variant={pass ? "default" : "destructive"}>{pass ? "Pass" : "Fail"}</Badge>
          </div>
          {reason && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{reason}</p>}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
            {intro?.exam.allow_retake && (
              <Button variant="outline" onClick={() => void retake()}><RotateCcw className="mr-2 h-4 w-4" />Retake exam</Button>
            )}
            <Button variant="outline" onClick={() => navigate("/student/results")}>My results</Button>
            <Button onClick={() => navigate("/student/exams")}>Back to my exams</Button>
          </div>
        </CardContent>
      </Card>,
    );
  }

  // ── Submitting / failed ───────────────────────────────────────
  if (phase === "submitting") {
    return shell(
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground" data-testid="submitting">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-medium text-foreground">Submitting your exam…</p>
        <p className="text-sm">Please don't close this page.</p>
      </div>,
    );
  }

  if (phase === "submit_failed") {
    return shell(
      <Card className="mx-auto mt-10 max-w-lg border-0 shadow-md" data-testid="submit-failed">
        <CardContent className="space-y-4 py-10 text-center">
          <WifiOff className="mx-auto h-10 w-10 text-amber-500" />
          <p className="text-lg font-semibold">We couldn't submit yet</p>
          <p className="text-sm text-muted-foreground">{submitError}</p>
          <p className="rounded-lg bg-muted p-3 text-sm">
            Don't worry — your answers are saved on this device and were being saved online as you worked.
            Check your connection, then press Try again.
          </p>
          <Button size="lg" onClick={() => void submit("manual")}><Send className="mr-2 h-4 w-4" />Try again</Button>
        </CardContent>
      </Card>,
    );
  }

  // ── The exam ──────────────────────────────────────────────────
  if (phase !== "running" || !run || total === 0) return null;
  const q = run.questions[current];
  const low = remaining <= 300;
  const unanswered = total - answeredCount;

  return (
    <div
      className="min-h-screen bg-[#f5f5f7] dark:bg-[#0f0f14]"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{run.exam.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {run.exam.subject_name} · {answeredCount}/{total} answered
              <span className="ml-2" aria-live="polite">
                {saveState === "saving" && "· Saving…"}
                {saveState === "saved" && "· Saved ✓"}
                {saveState === "offline" && <span className="text-amber-600">· Offline — will retry</span>}
              </span>
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-bold",
              low ? "animate-pulse bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-muted",
            )}
            data-testid="timer"
            aria-label="Time remaining"
          >
            <Clock className="h-4 w-4" />{formatClock(remaining)}
          </div>
          {run.exam.allow_calculator && (
            <Button variant="outline" size="icon" onClick={() => setCalcOpen((v) => !v)} aria-label="Calculator" title="Calculator">
              <Calculator className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => setConfirmOpen(true)} data-testid="submit-button">
            <Send className="mr-2 h-4 w-4" /><span className="hidden sm:inline">Submit</span><span className="sm:hidden">Submit</span>
          </Button>
        </div>
        <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / total) * 100}%` }} /></div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4 lg:grid-cols-[1fr_260px]">
        {/* Question */}
        <Card className="border-0 shadow-md">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Question {current + 1} of {total}</Badge>
              <button
                type="button"
                onClick={() => toggleFlag(q.id)}
                className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                  flagged[q.id] ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" : "text-muted-foreground hover:bg-muted")}
              >
                <Flag className="h-3.5 w-3.5" />{flagged[q.id] ? "Flagged" : "Flag for review"}
              </button>
            </div>

            <p className="select-none whitespace-pre-wrap break-words text-lg font-medium leading-relaxed" data-testid="question-text">
              {q.question_text}
            </p>

            <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
              {LETTERS.map((l) => {
                const selected = answers[q.id] === l;
                return (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`option-${l}`}
                    onClick={() => choose(q.id, l)}
                    className={cn(
                      "flex w-full select-none items-start gap-3 rounded-xl border-2 p-4 text-left transition active:scale-[.99]",
                      selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50 hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                      selected && "border-primary bg-primary text-primary-foreground")}>{l}</span>
                    <span className="whitespace-pre-wrap break-words pt-1">{q[optionKey(l)]}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              {answers[q.id] && (
                <button type="button" onClick={() => choose(q.id, null)} className="text-xs text-muted-foreground underline">Clear answer</button>
              )}
              {current < total - 1 ? (
                <Button onClick={() => setCurrent(current + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
              ) : (
                <Button onClick={() => setConfirmOpen(true)}><Send className="mr-2 h-4 w-4" />Finish</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Navigator */}
        <Card className="h-fit border-0 shadow-md">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">Questions</p>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
              {run.questions.map((qq, i) => {
                const isAnswered = !!answers[qq.id];
                const isCurrent = i === current;
                return (
                  <button
                    key={qq.id}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ""}${flagged[qq.id] ? ", flagged" : ""}`}
                    className={cn(
                      "relative h-9 rounded-md border text-sm font-medium transition",
                      isAnswered ? "border-primary/40 bg-primary/15" : "bg-background hover:bg-muted",
                      isCurrent && "ring-2 ring-primary",
                    )}
                  >
                    {i + 1}
                    {flagged[qq.id] && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-primary/30 align-middle" />Answered</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border align-middle" />Not answered</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-500 align-middle" />Flagged</p>
              {violations > 0 && <p className="text-amber-600">Warnings: {violations}/{maxViolations}</p>}
            </div>
          </CardContent>
        </Card>
      </main>

      {calcOpen && <ExamCalculator onClose={() => setCalcOpen(false)} />}

      {/* Confirm submit */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your exam?</DialogTitle>
            <DialogDescription>You can't change your answers after submitting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <p>Answered: <b>{answeredCount}</b> of {total}</p>
            {unanswered > 0 && <p className="text-red-600 dark:text-red-400">Unanswered: <b>{unanswered}</b></p>}
            {flaggedCount > 0 && <p className="text-amber-700 dark:text-amber-300">Flagged for review: <b>{flaggedCount}</b></p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Keep working</Button>
            <Button onClick={() => void submit("manual")} data-testid="confirm-submit">
              <Send className="mr-2 h-4 w-4" />Yes, submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Left-the-screen warning */}
      <Dialog open={!!warning} onOpenChange={(o) => { if (!o) setWarning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-5 w-5" />Stay on the exam screen</DialogTitle>
            <DialogDescription>{warning}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setWarning(null)}>Back to my exam</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
