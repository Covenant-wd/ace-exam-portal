import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, ChevronDown } from "lucide-react";

export default function Results() {
  const { schoolId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/instructor") ? "/instructor" : "/admin";

  // ── Typed interfaces replace any[] (W10) ─────────────────────────
  interface ExamOption { id: string; title: string; subjects: { name: string } | null }
  interface ResultRow {
    id: string; student_id: string; score: number;
    total_questions: number; submitted_at: string;
    profile: { full_name: string; class_name: string } | null;
  }

  const PAGE_SIZE = 50;
  const [exams,          setExams]          = useState<ExamOption[]>([]);
  const [selectedExam,   setSelectedExam]   = useState<string>("");
  const [results,        setResults]        = useState<ResultRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [page,           setPage]           = useState(0);
  const [hasMore,        setHasMore]        = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    supabase
      .from("exams")
      .select("id, title, exam_type, subjects(name)")
      .eq("school_id", schoolId)
      // Theory exams are display-only with no student scores — exclude them
      .neq("exam_type", "theory")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setExams((data ?? []) as ExamOption[]);
        setLoading(false);
      });
  }, [schoolId]);

  // ── Paginated fetch (W4) ──────────────────────────────────────
  const fetchPage = useCallback(async (examId: string, pageIdx: number, append = false) => {
    setLoadingResults(true);
    const from = pageIdx * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data: attempts, count } = await supabase
      .from("exam_attempts")
      .select("id, student_id, score, total_questions, submitted_at", { count: "exact" })
      .eq("exam_id", examId)
      .eq("is_submitted", true)
      .order("score", { ascending: false })
      .range(from, to);

    if (!attempts || attempts.length === 0) {
      if (!append) setResults([]);
      setHasMore(false);
      setLoadingResults(false);
      return;
    }

    const studentIds = [...new Set(attempts.map((a) => a.student_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, class_name")
      .in("user_id", studentIds)
      .eq("school_id", schoolId!);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const rows: ResultRow[] = attempts.map((a) => ({
      ...a,
      profile: (profileMap.get(a.student_id) as ResultRow["profile"]) ?? null,
    }));
    setResults((prev) => append ? [...prev, ...rows] : rows);
    setHasMore((count ?? 0) > to + 1);
    setLoadingResults(false);
  }, [schoolId]);

  useEffect(() => {
    if (!selectedExam) { setResults([]); setHasMore(false); return; }
    setPage(0);
    fetchPage(selectedExam, 0, false);
  }, [selectedExam, fetchPage]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(selectedExam, next, true);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Results</h1>

      <div className="mb-4 max-w-sm">
        <Select value={selectedExam} onValueChange={setSelectedExam}>
          <SelectTrigger>
            <SelectValue placeholder="Select an exam" />
          </SelectTrigger>
          <SelectContent>
            {exams.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title} — {e.subjects?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedExam && (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            {loadingResults ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : results.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                No submissions yet for this exam.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => {
                    const pct = r.total_questions
                      ? Math.round((r.score / r.total_questions) * 100)
                      : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {r.profile?.full_name || "—"}
                        </TableCell>
                        <TableCell>{r.profile?.class_name || "—"}</TableCell>
                        <TableCell>
                          {r.score}/{r.total_questions}
                        </TableCell>
                        <TableCell>{pct}%</TableCell>
                        <TableCell>
                          <Badge variant={pct >= 50 ? "default" : "destructive"}>
                            {pct >= 50 ? "Pass" : "Fail"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              navigate(`${basePath}/results/${r.id}/review`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                            View Answers
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingResults}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loadingResults
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ChevronDown className="h-4 w-4" />}
            Load more results
          </button>
        </div>
      )}
    </div>
  );
}
