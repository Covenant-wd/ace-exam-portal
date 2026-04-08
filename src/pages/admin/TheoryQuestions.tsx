import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ArrowLeft } from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import RichContentRenderer from "@/components/RichContentRenderer";

interface TheoryQuestion {
  id: string;
  exam_id: string;
  question_number: string;
  sub_label: string;
  question_text: string;
  marks: number;
  question_order: number;
}

export default function TheoryQuestions() {
  const { examId } = useParams<{ examId: string }>();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/instructor") ? "/instructor" : "/admin";
  const [examTitle, setExamTitle] = useState("");
  const [questions, setQuestions] = useState<TheoryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TheoryQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  const [questionNumber, setQuestionNumber] = useState("");
  const [subLabel, setSubLabel] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [marks, setMarks] = useState("1");

  const fetchData = async () => {
    if (!examId) return;
    const [examRes, qRes] = await Promise.all([
      supabase.from("exams").select("title").eq("id", examId).single(),
      supabase.from("theory_questions" as any).select("*").eq("exam_id", examId).order("question_order"),
    ]);
    setExamTitle(examRes.data?.title || "");
    setQuestions((qRes.data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [examId]);

  const reset = () => {
    setEditing(null); setQuestionNumber(""); setSubLabel(""); setQuestionText(""); setMarks("1");
  };

  const handleSave = async () => {
    if (!questionNumber.trim() || !questionText.trim()) {
      toast.error("Question number and text are required");
      return;
    }
    setSaving(true);
    const payload: any = {
      exam_id: examId,
      question_number: questionNumber.trim(),
      sub_label: subLabel.trim(),
      question_text: questionText,
      marks: parseInt(marks) || 1,
      question_order: editing ? editing.question_order : questions.length,
    };

    if (editing) {
      const { error } = await supabase.from("theory_questions" as any).update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else toast.success("Question updated");
    } else {
      const { error } = await supabase.from("theory_questions" as any).insert(payload);
      if (error) toast.error(error.message); else toast.success("Question added");
    }
    setSaving(false); setOpen(false); reset(); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("theory_questions" as any).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchData(); }
  };

  const openEdit = (q: TheoryQuestion) => {
    setEditing(q); setQuestionNumber(q.question_number); setSubLabel(q.sub_label || "");
    setQuestionText(q.question_text); setMarks(String(q.marks)); setOpen(true);
  };

  // Group questions by question_number
  const grouped: Record<string, TheoryQuestion[]> = {};
  questions.forEach((q) => {
    if (!grouped[q.question_number]) grouped[q.question_number] = [];
    grouped[q.question_number].push(q);
  });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to={`${basePath}/exams`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">Theory Questions</h1>
          <p className="text-sm text-muted-foreground">{examTitle}</p>
        </div>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild><Button onClick={reset}><Plus className="mr-2 h-4 w-4" />Add Question</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit Question" : "Add Question"}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Question Number *</Label>
                    <Input value={questionNumber} onChange={(e) => setQuestionNumber(e.target.value)} placeholder='e.g. "1", "2"' />
                  </div>
                  <div className="space-y-2">
                    <Label>Sub-label</Label>
                    <Input value={subLabel} onChange={(e) => setSubLabel(e.target.value)} placeholder='e.g. "a", "b", "a(i)"' />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Question Text *</Label>
                  <RichTextEditor value={questionText} onChange={setQuestionText} placeholder="Enter question..." rows={5} />
                </div>
                <div className="space-y-2">
                  <Label>Marks</Label>
                  <Input type="number" value={marks} onChange={(e) => setMarks(e.target.value)} min="1" />
                </div>
                <Button onClick={handleSave} className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {questions.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No theory questions yet. Add one to get started!</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([num, qs]) => (
            <Card key={num} className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Question {num}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {qs.map((q) => (
                  <div key={q.id} className={`rounded-lg border p-4 ${q.sub_label ? "ml-6" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {q.question_number}{q.sub_label ? q.sub_label : ""}
                          </span>
                          <Badge variant="outline" className="text-xs">{q.marks} mark{q.marks !== 1 ? "s" : ""}</Badge>
                        </div>
                        <RichContentRenderer content={q.question_text} className="text-sm" />
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
