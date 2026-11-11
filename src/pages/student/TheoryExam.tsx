// src/pages/student/TheoryExam.tsx
// A theory exam is answered on paper: the student reads (and can print) the question paper here.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSchoolLogo, useSchoolName } from "@/hooks/useSchoolSettings";
import InAppCbtGate from "@/components/InAppCbtGate";
import { TheoryPaperView } from "@/components/TheoryPaper";
import { type TheoryQuestion, friendlyExamError } from "@/lib/exams";

interface Intro {
  state: string;
  exam: { id: string; title: string; instructions: string | null; exam_type: string; duration_minutes: number;
          start_date: string | null; end_date: string | null; subject_name: string | null };
}

export default function TheoryExam() {
  return (
    <InAppCbtGate>
      <TheoryExamInner />
    </InAppCbtGate>
  );
}

function TheoryExamInner() {
  const { examId = "" } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { schoolName } = useSchoolName();
  const { logoUrl } = useSchoolLogo();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intro, setIntro] = useState<Intro | null>(null);
  const [questions, setQuestions] = useState<TheoryQuestion[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = supabase as any;
      const { data, error: err } = await db.rpc("get_exam_intro", { _exam_id: examId });
      if (!alive) return;
      if (err) { setError(friendlyExamError(err.message)); setLoading(false); return; }
      const d = data as Intro;
      if (d.exam.exam_type !== "theory") { navigate(`/student/exam/${examId}`, { replace: true }); return; }
      setIntro(d);
      if (d.state === "available" || d.state === "in_progress") {
        const { data: qs } = await db.from("theory_questions").select("*").eq("exam_id", examId).order("question_order");
        if (alive) setQuestions((qs as TheoryQuestion[]) || []);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [examId, navigate]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const back = (
    <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate("/student/exams")}>
      <ArrowLeft className="mr-1.5 h-4 w-4" />My exams
    </Button>
  );

  if (error || !intro) {
    return (
      <div>{back}<Card><CardContent className="py-12 text-center">
        <p className="font-medium">This question paper can't be opened</p>
        <p className="mt-1 text-sm text-muted-foreground">{error || "It is not available."}</p>
      </CardContent></Card></div>
    );
  }

  const e = intro.exam;
  if (intro.state === "not_started") {
    return (
      <div>{back}<Card><CardContent className="py-12 text-center">
        <p className="font-medium">{e.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The paper opens {e.start_date ? new Date(e.start_date).toLocaleString() : "soon"}.
        </p>
      </CardContent></Card></div>
    );
  }
  if (intro.state === "closed") {
    return (
      <div>{back}<Card><CardContent className="py-12 text-center">
        <p className="font-medium">{e.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">This paper is closed.</p>
      </CardContent></Card></div>
    );
  }

  return (
    <div className="space-y-3">
      {back}
      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-100">
        This is a theory exam. Read the questions below and write your answers on paper as your teacher instructs.
      </p>
      {questions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No questions have been added to this paper yet.</CardContent></Card>
      ) : (
        <TheoryPaperView
          data={{
            title: e.title, subjectName: e.subject_name, durationMinutes: e.duration_minutes,
            instructions: e.instructions, schoolName, logoUrl: logoUrl || undefined, questions,
          }}
        />
      )}
    </div>
  );
}
