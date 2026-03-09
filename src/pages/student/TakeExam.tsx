import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Clock, Flag, ChevronLeft, ChevronRight, AlertTriangle, Calculator as CalcIcon } from "lucide-react";
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
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [allowCalculator, setAllowCalculator] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      // Check existing attempt
      const { data: existing } = await supabase.from("exam_attempts")
        .select("*").eq("exam_id", examId!).eq("student_id", user!.id).single();

      if (existing?.is_submitted) {
        toast.info("You've already completed this exam.");
        navigate("/student");
        return;
      }

      const [examRes, qRes] = await Promise.all([
        supabase.from("exams").select("*").eq("id", examId!).single(),
        supabase.from("questions").select("id, question_text, option_a, option_b, option_c, option_d, question_order")
          .eq("exam_id", examId!).order("question_order"),
      ]);

      if (!examRes.data) { navigate("/student"); return; }
      setExam(examRes.data);
      setQuestions(qRes.data ?? []);

      if (existing) {
        setAttemptId(existing.id);
        // Calculate remaining time
        const elapsed = (Date.now() - new Date(existing.started_at).getTime()) / 1000;
        const remaining = Math.max(0, examRes.data.duration_minutes * 60 - elapsed);
        setTimeLeft(Math.floor(remaining));

        // Load existing answers
        const { data: savedAnswers } = await supabase.from("student_answers")
          .select("question_id, selected_option").eq("attempt_id", existing.id);
        const map: Record<string, string> = {};
        (savedAnswers ?? []).forEach((a: any) => { if (a.selected_option) map[a.question_id] = a.selected_option; });
        setAnswers(map);
      } else {
        // Create new attempt
        const { data: attempt } = await supabase.from("exam_attempts")
          .insert({ exam_id: examId!, student_id: user!.id }).select().single();
        setAttemptId(attempt!.id);
        setTimeLeft(examRes.data.duration_minutes * 60);
      }

      setLoading(false);
    };
    init();
  }, [examId, user, navigate]);

  const submitExam = useCallback(async (isTimeout = false) => {
    if (submittedRef.current || !attemptId) return;
    submittedRef.current = true;
    setSubmitting(true);

    // Get correct answers
    const { data: correctData } = await supabase.from("questions")
      .select("id, correct_option").eq("exam_id", examId!);

    const correctMap: Record<string, string> = {};
    (correctData ?? []).forEach((q: any) => { correctMap[q.id] = q.correct_option; });

    // Upsert all answers
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
      is_submitted: true, score, total_questions: questions.length, submitted_at: new Date().toISOString(),
    }).eq("id", attemptId);

    toast.success(isTimeout ? "Time's up! Exam auto-submitted." : "Exam submitted successfully!");
    navigate("/student/results");
  }, [attemptId, answers, questions, examId, navigate]);

  // Countdown timer
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
    // Save immediately
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

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const currentQ = questions[currentIndex];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isLowTime = timeLeft < 60;
  const optionLabels = ["A", "B", "C", "D"] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold truncate">{exam?.title}</h1>
        <div className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono font-bold", isLowTime ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted")}>
          <Clock className="h-4 w-4" />
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      </div>

      <div className="mx-auto flex max-w-4xl gap-4 p-4">
        {/* Question navigator (desktop) */}
        <div className="hidden w-20 shrink-0 lg:block">
          <div className="sticky top-20 space-y-2">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                  currentIndex === i ? "bg-primary text-primary-foreground" : answers[q.id] ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
                  flagged.has(q.id) && "ring-2 ring-accent"
                )}
              >
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
                <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{currentIndex + 1}</span>
                of {questions.length}
              </CardTitle>
              <Button variant={flagged.has(currentQ.id) ? "default" : "outline"} size="sm" onClick={() => toggleFlag(currentQ.id)}>
                <Flag className="mr-1 h-4 w-4" />{flagged.has(currentQ.id) ? "Flagged" : "Flag"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6 text-lg font-medium"><RichContentRenderer content={currentQ.question_text} /></div>
              <div className="space-y-3">
                {optionLabels.map((l) => {
                  const selected = answers[currentQ.id] === l;
                  return (
                    <button
                      key={l}
                      onClick={() => selectAnswer(currentQ.id, l)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
                        selected ? "border-primary bg-primary/10 font-medium" : "border-border hover:border-primary/50 hover:bg-muted"
                      )}
                    >
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", selected ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {l}
                      </span>
                      <RichContentRenderer content={(currentQ as any)[`option_${l.toLowerCase()}`]} />
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Previous
                </Button>
                {currentIndex < questions.length - 1 ? (
                  <Button onClick={() => setCurrentIndex((i) => i + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="default" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Exam"}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-accent" />Submit Exam?</AlertDialogTitle>
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
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium",
                  currentIndex === i ? "bg-primary text-primary-foreground" : answers[q.id] ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
                  flagged.has(q.id) && "ring-2 ring-accent"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
