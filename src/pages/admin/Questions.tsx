import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/RichTextEditor";
import RichContentRenderer from "@/components/RichContentRenderer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, ArrowLeft } from "lucide-react";

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  question_order: number;
}

export default function Questions() {
  const { examId } = useParams<{ examId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState({ question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [qRes, eRes] = await Promise.all([
      supabase.from("questions").select("*").eq("exam_id", examId).order("question_order"),
      supabase.from("exams").select("title").eq("id", examId!).single(),
    ]);
    setQuestions((qRes.data as Question[]) ?? []);
    setExamTitle(eRes.data?.title ?? "");
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [examId]);

  const handleSave = async () => {
    if (!form.question_text.trim() || !form.option_a.trim()) { toast.error("Fill all required fields"); return; }
    setSaving(true);
    const payload = { ...form, exam_id: examId!, question_order: editing ? editing.question_order : questions.length + 1 };
    if (editing) {
      const { error } = await supabase.from("questions").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else toast.success("Updated");
    } else {
      const { error } = await supabase.from("questions").insert(payload);
      if (error) toast.error(error.message); else toast.success("Added");
    }
    setSaving(false); setOpen(false); resetForm(); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questions").delete().eq("id", id);
    toast.success("Deleted"); fetchData();
  };

  const resetForm = () => { setEditing(null); setForm({ question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" }); };

  const openEdit = (q: Question) => {
    setEditing(q);
    setForm({ question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, correct_option: q.correct_option });
    setOpen(true);
  };

  const optionLabels = ["A", "B", "C", "D"] as const;

  return (
    <div>
      <div className="mb-6">
        <Link to="/admin/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Exams
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Questions — {examTitle}</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={resetForm}><Plus className="mr-2 h-4 w-4" />Add Question</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Edit Question" : "New Question"}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2"><Label>Question</Label><RichTextEditor value={form.question_text} onChange={(v) => setForm({ ...form, question_text: v })} rows={3} placeholder="Enter question text..." /></div>
                {optionLabels.map((l) => (
                  <div key={l} className="space-y-2">
                    <Label>Option {l}</Label>
                    <RichTextEditor value={(form as any)[`option_${l.toLowerCase()}`]} onChange={(v) => setForm({ ...form, [`option_${l.toLowerCase()}`]: v })} rows={1} placeholder={`Option ${l}`} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>Correct Answer</Label>
                  <RadioGroup value={form.correct_option} onValueChange={(v) => setForm({ ...form, correct_option: v })} className="flex gap-4">
                    {optionLabels.map((l) => (
                      <div key={l} className="flex items-center gap-2">
                        <RadioGroupItem value={l} id={`opt-${l}`} />
                        <Label htmlFor={`opt-${l}`}>{l}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Add Question"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : questions.length === 0 ? (
        <Card className="border-0 shadow-md"><CardContent className="p-8 text-center text-muted-foreground">No questions yet. Add your first one!</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <Card key={q.id} className="border-0 shadow-md">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-base font-medium">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>
                  <RichContentRenderer content={q.question_text} />
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {optionLabels.map((l) => (
                    <div key={l} className={`rounded-lg border p-2 text-sm ${q.correct_option === l ? "border-primary bg-primary/10 font-medium" : ""}`}>
                      <span className="mr-2 font-semibold">{l}.</span><RichContentRenderer content={(q as any)[`option_${l.toLowerCase()}`]} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
