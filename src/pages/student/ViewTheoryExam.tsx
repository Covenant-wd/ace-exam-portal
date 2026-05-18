import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, AlertTriangle } from "lucide-react";
import RichContentRenderer from "@/components/RichContentRenderer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TheoryQuestion {
  id: string;
  question_number: string;
  sub_label: string;
  question_text: string;
  marks: number;
  question_order: number;
}

export default function ViewTheoryExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<TheoryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  // FIX: Store the active attempt id in a ref so the timer's auto-close
  // callback always has the current value regardless of closure staleness.
  const attemptIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!examId) return;
      const [examRes, qRes] = await Promise.all([
        supabase.from("exams").select("*, subjects(name)").eq("id", examId).single(),
        supabase.from("theory_questions" as any).select("*").eq("exam_id", examId).order("question_order"),
      ]);
      setExam(examRes.data);
      setQuestions((qRes.data as any[]) ?? []);

      // Check if already started
      if (user) {
        const { data: attempt } = await supabase.from("exam_attempts")
          .select("*").eq("exam_id", examId).eq("student_id", user.id)
          .order("started_at", { ascending: false }).limit(1).single();

        if (attempt && !attempt.is_submitted) {
          attemptIdRef.current = attempt.id; // keep ref in sync
          const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
          const remaining = (examRes.data?.duration_minutes || 30) * 60 - elapsed;
          if (remaining > 0) {
            setTimeLeft(remaining);
            setStarted(true);
          } else {
            // FIX: For theory exams (paper-based), there are no student_answers rows to
            // insert — the student writes on paper. We only need to close the attempt.
            // This is safe: just update is_submitted=true directly.
            setTimeUp(true);
            await supabase
              .from("exam_attempts")
              .update({ is_submitted: true, submitted_at: new Date().toISOString() } as any)
              .eq("id", attempt.id);
          }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [examId, user]);

  // Countdown timer
  useEffect(() => {
    if (!started || timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setTimeUp(true);
          setStarted(false);

          // FIX: Close the attempt when time runs out.
          // Theory exams are paper-based so there are no student_answers rows —
          // we can safely set is_submitted=true immediately (no answer data to lose).
          // Use the ref to get the current attempt id (state may be stale in closure).
          const currentAttemptId = attemptIdRef.current;
          if (currentAttemptId) {
            supabase
              .from("exam_attempts")
              .update({ is_submitted: true, submitted_at: new Date().toISOString() } as any)
              .eq("id", currentAttemptId)
              .then(({ error }) => {
                if (error) {
                  console.error("[ViewTheoryExam] Failed to close timed-out attempt:", error.message);
                }
              });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started]);

  const startExam = useCallback(async () => {
    if (!user || !examId) return;

    // FIX: Capture the returned attempt row so we have the real attempt id.
    // The previous code called .insert() without .select(), so attemptIdRef was
    // never populated — the timer's auto-close callback couldn't close the attempt.
    const { data: attempt, error: attemptErr } = await supabase
      .from("exam_attempts")
      .insert({
        exam_id: examId,
        student_id: user.id,
        total_questions: questions.length,
      } as any)
      .select()
      .single();

    if (attemptErr || !attempt) {
      console.error("[ViewTheoryExam] Failed to create attempt:", attemptErr?.message);
      return;
    }

    attemptIdRef.current = attempt.id; // keep ref in sync for timer closure
    setTimeLeft((exam?.duration_minutes || 30) * 60);
    setStarted(true);
    setShowStartConfirm(false);
  }, [user, examId, exam, questions.length]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!exam) return <div className="p-8 text-center">Exam not found</div>;

  // Group questions by number
  const grouped: Record<string, TheoryQuestion[]> = {};
  questions.forEach((q) => {
    if (!grouped[q.question_number]) grouped[q.question_number] = [];
    grouped[q.question_number].push(q);
  });

  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  if (timeUp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h1 className="text-3xl font-bold">Time's Up!</h1>
        <p className="text-muted-foreground">The exam duration has ended. Please submit your answer sheets.</p>
        <Button onClick={() => navigate("/student/exams")}>Back to Exams</Button>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{exam.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{(exam as any).subjects?.name}</p>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>{exam.duration_minutes} minutes</span>
            </div>
            <p className="text-sm">Total: {totalMarks} marks • {questions.length} question{questions.length !== 1 ? "s" : ""}</p>
            {exam.instructions && (
              <div className="rounded-lg border bg-muted/50 p-3 text-left text-sm">
                <p className="mb-1 font-medium">Instructions:</p>
                <p className="whitespace-pre-wrap">{exam.instructions}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Questions will be displayed on screen. Write your answers on your answer sheet.</p>
            <Button className="w-full" onClick={() => setShowStartConfirm(true)}>Start Exam</Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/student/exams")}>Go Back</Button>
          </CardContent>
        </Card>

        <AlertDialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Exam?</AlertDialogTitle>
              <AlertDialogDescription>
                The timer will begin once you start. You have {exam.duration_minutes} minutes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={startExam}>Start</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Active exam view
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b bg-card px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-bold">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">{(exam as any).subjects?.name}</p>
        </div>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${
          (timeLeft ?? 0) < 300 ? "bg-destructive/10 text-destructive animate-pulse" : "bg-primary/10 text-primary"
        }`}>
          <Clock className="h-5 w-5" />
          {formatTime(timeLeft ?? 0)}
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-4 pb-20">
        {/* Instructions */}
        {exam.instructions && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="mb-1 text-sm font-semibold">Instructions:</p>
              <p className="whitespace-pre-wrap text-sm">{exam.instructions}</p>
            </CardContent>
          </Card>
        )}

        {/* Questions */}
        <div className="space-y-6">
          {Object.entries(grouped).map(([num, qs]) => (
            <Card key={num} className="shadow-md">
              <CardContent className="p-5">
                {qs.map((q, i) => (
                  <div key={q.id} className={`${i > 0 ? "mt-4 border-t pt-4" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 font-bold text-primary">
                        {q.question_number}{q.sub_label || ""}. 
                      </span>
                      <div className="flex-1">
                        <RichContentRenderer content={q.question_text} />
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {q.marks} mk{q.marks !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Total: {totalMarks} marks
        </div>
      </div>
    </div>
  );
}
