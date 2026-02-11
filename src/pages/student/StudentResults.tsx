import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function StudentResults() {
  const { user } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("exam_attempts")
      .select("*, exams(title, subjects(name))")
      .eq("student_id", user!.id).eq("is_submitted", true)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => { setResults(data ?? []); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">My Results</h1>
      {results.length === 0 ? (
        <p className="text-muted-foreground">You haven't completed any exams yet.</p>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Score</TableHead><TableHead>Percentage</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {results.map((r) => {
                  const pct = r.total_questions ? Math.round((r.score / r.total_questions) * 100) : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.exams?.title || "—"}</TableCell>
                      <TableCell>{r.exams?.subjects?.name || "—"}</TableCell>
                      <TableCell>{r.score}/{r.total_questions}</TableCell>
                      <TableCell>{pct}%</TableCell>
                      <TableCell><Badge variant={pct >= 50 ? "default" : "destructive"}>{pct >= 50 ? "Pass" : "Fail"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
