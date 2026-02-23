import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, BookOpen } from "lucide-react";

export default function StudentExams() {
  const { user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExams = async () => {
      // Get student's class_id and class subjects
      const { data: profile } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("user_id", user!.id)
        .single();

      const classId = profile?.class_id;

      // Get subjects for the student's class
      let classSubjectIds: string[] = [];
      if (classId) {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("subject_id")
          .eq("class_id", classId);
        classSubjectIds = (cs ?? []).map((r: any) => r.subject_id);
      }

      // Get published exams, filtered by class
      let query = supabase
        .from("exams")
        .select("*, subjects(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      const { data: allExams } = await query;

      // Filter: show exams that match student's class OR have no class set,
      // AND whose subject is in the student's class subjects (if class assigned)
      const filtered = (allExams ?? []).filter((e: any) => {
        // Class filter: exam is for student's class or for all classes
        const classMatch = !e.class_id || e.class_id === classId;
        // Subject filter: if student has a class, only show class subjects
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
                        {completed && <Badge variant="secondary">Completed</Badge>}
                      </div>
                      {exam.description && <CardDescription>{exam.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />{exam.duration_minutes} minutes
                      </div>
                      {completed ? (
                        <p className="text-sm font-medium">Score: {attempt.score}/{attempt.total_questions} ({Math.round((attempt.score / attempt.total_questions) * 100)}%)</p>
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
