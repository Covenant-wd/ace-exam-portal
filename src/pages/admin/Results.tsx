import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function Results() {
  const { schoolId } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    supabase.from("exams").select("id, title, subjects(name)").eq("school_id", schoolId).order("created_at", { ascending: false }).then(({ data }) => {
      setExams(data ?? []);
      setLoading(false);
    });
  }, [schoolId]);

  useEffect(() => {
    if (!selectedExam) { setResults([]); return; }
    setLoadingResults(true);
    (async () => {
      const { data: attempts } = await supabase.from("exam_attempts").select("*")
        .eq("exam_id", selectedExam).eq("is_submitted", true).order("score", { ascending: false });
      if (!attempts || attempts.length === 0) { setResults([]); setLoadingResults(false); return; }
      const studentIds = [...new Set(attempts.map(a => a.student_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, class_name")
        .in("user_id", studentIds).eq("school_id", schoolId!);
      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
      setResults(attempts.map(a => ({ ...a, profile: profileMap.get(a.student_id) ?? null })));
      setLoadingResults(false);
    })();
  }, [selectedExam]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Results</h1>
      <div className="mb-4 max-w-sm">
        <Select value={selectedExam} onValueChange={setSelectedExam}>
          <SelectTrigger><SelectValue placeholder="Select an exam" /></SelectTrigger>
          <SelectContent>{exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.title} — {e.subjects?.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {selectedExam && (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            {loadingResults ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : results.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">No submissions yet for this exam.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Score</TableHead><TableHead>Percentage</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {results.map((r, i) => {
                    const pct = r.total_questions ? Math.round((r.score / r.total_questions) * 100) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{r.profile?.full_name || "—"}</TableCell>
                        <TableCell>{r.profile?.class_name || "—"}</TableCell>
                        <TableCell>{r.score}/{r.total_questions}</TableCell>
                        <TableCell>{pct}%</TableCell>
                        <TableCell><Badge variant={pct >= 50 ? "default" : "destructive"}>{pct >= 50 ? "Pass" : "Fail"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
