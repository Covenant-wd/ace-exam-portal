import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, BookOpen, Calendar, GraduationCap } from "lucide-react";

export default function StudentExams() {
  const { user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);

  useEffect(() => {
    const fetchExams = async () => {
      // Fetch active session & term
      const [sessionRes, termRes] = await Promise.all([
        supabase.from("sessions").select("name").eq("is_active", true).single(),
        supabase.from("terms").select("name").eq("is_active", true).limit(1).single(),
      ]);
      setActiveSession(sessionRes.data?.name ?? null);
      setActiveTerm(termRes.data?.name ?? null);

      // Get student's class_id and class subjects
      const { data: profile } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("user_id", user!.id)
        .single();

      const classId = profile?.class_id;

      let classSubjectIds: string[] = [];
      if (classId) {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("subject_id")
          .eq("class_id", classId);
        classSubjectIds = (cs ?? []).map((r: any) => r.subject_id);
      }

      let query = supabase
        .from("exams")
        .select("*, subjects(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      const { data: allExams } = await query;

      const filtered = (allExams ?? []).filter((e: any) => {
        const classMatch = !e.class_id || e.class_id === classId;
        const subjectMatch = classSubjectIds.length === 0 || classSubjectIds.includes(e.subject_id);
        return classMatch && subjectMatch;
      });

      const { data: attemptsData } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", user!.id);

      setExams(filtered);
      const map: Record<string, any> = {};
      (attemptsData ?? []).forEach((a: any) => { map[a.exam_id] = a; });
      setAttempts(map);
      setLoading(false);
    };
    fetchExams();
  }, [user]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // Group exams by subject
  const grouped: Record<string, any[]> = {};
  exams.forEach((e) => {
    const subj = e.subjects?.name || "Other";
    if (!grouped[subj]) grouped[subj] = [];
    grouped[subj].push(e);
  });

  return (
    <div>
      {/* Active Session & Term Banner */}
      {(activeSession || activeTerm) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {activeSession && (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Session:</span>
              <span className="text-sm font-semibold">{activeSession}</span>
              <Badge variant="default" className="ml-1 text-xs">Active</Badge>
            </div>
          )}
          {activeTerm && (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Term:</span>
              <span className="text-sm font-semibold">{activeTerm}</span>
              <Badge variant="default" className="ml-1 text-xs">Active</Badge>
            </div>
          )}
        </div>
      )}

      <h1 className="mb-6 text-3xl font-bold">Available Exams</h1>
      {Object.keys(grouped).length === 0 ? (
        <p className="text-muted-foreground">No exams are currently available.</p>
      ) : (
        Object.entries(grouped).map(([subject, exams]) => (
          <div key={subject} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><BookOpen className="h-5 w-5 text-primary" />{subject}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exams.map((exam) => {
                const attempt = attempts[exam.id];
                const completed = attempt?.is_submitted;
                return (
                  <Card key={exam.id} className="border-0 shadow-md transition-shadow hover:shadow-lg">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{exam.title}</CardTitle>
                        {completed && (
                          <Badge variant={exam.allow_retake ? "outline" : "secondary"}>
                            {exam.allow_retake ? "Retake Available" : "Completed"}
                          </Badge>
                        )}
                      </div>
                      {exam.description && <CardDescription>{exam.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />{exam.duration_minutes} minutes
                      </div>
                      {completed ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Score: {attempt.score}/{attempt.total_questions} ({Math.round((attempt.score / attempt.total_questions) * 100)}%)</p>
                          {exam.allow_retake ? (
                            <Button asChild variant="outline" className="w-full">
                              <Link to={`/student/exam/${exam.id}`}>Retake Exam</Link>
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center">Retake not allowed</p>
                          )}
                        </div>
                      ) : (
                        <Button asChild className="w-full"><Link to={`/student/exam/${exam.id}`}>Start Exam</Link></Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
