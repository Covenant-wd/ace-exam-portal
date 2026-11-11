// src/pages/admin/ExamQuestions.tsx
// Add / edit / upload the questions of an exam. Shared by admins and teachers.
//   • Multiple-choice exams: one-by-one editor + bulk upload (CSV file or a paste from Excel).
//   • Theory exams: the question paper (number, part, text, marks) with a print preview.
// Access is decided by the database: a teacher can only open exams of their own subject + class.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Download, Eye, Loader2, Pencil, Plus, RotateCcw, Trash2, Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/hooks/useSubscription";
import { useSchoolLogo, useSchoolName } from "@/hooks/useSchoolSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import InAppCbtGate from "@/components/InAppCbtGate";
import { TheoryPaperView } from "@/components/TheoryPaper";
import {
  CSV_TEMPLATE, type ExamRow, type McqQuestion, type ParsedQuestion, type TheoryQuestion,
  embeddedCount, examStatus, friendlyExamError, parseQuestionsCsv, STATUS_LABEL,
} from "@/lib/exams";

const LETTERS = ["A", "B", "C", "D"] as const;
const optKey = (l: string) => `option_${l.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d";

const emptyMcq = { question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" };
const emptyTheory = { question_number: "", sub_label: "", question_text: "", marks: "5" };

export default function ExamQuestions() {
  return (
    <InAppCbtGate>
      <ExamQuestionsInner />
    </InAppCbtGate>
  );
}

function ExamQuestionsInner() {
  const { examId = "" } = useParams<{ examId: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const base = role === "instructor" ? "/instructor" : "/admin";
  const { canCreateExam } = useSubscription();
  const { schoolName } = useSchoolName();
  const { logoUrl } = useSchoolLogo();
  const db = supabase as any;

  const [exam, setExam] = useState<ExamRow | null>(null);
  const [mcq, setMcq] = useState<McqQuestion[]>([]);
  const [theory, setTheory] = useState<TheoryQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  // MCQ add/edit
  const [mcqDialog, setMcqDialog] = useState(false);
  const [editingMcq, setEditingMcq] = useState<McqQuestion | null>(null);
  const [mcqForm, setMcqForm] = useState(emptyMcq);

  // theory add/edit + preview
  const [theoryDialog, setTheoryDialog] = useState(false);
  const [editingTheory, setEditingTheory] = useState<TheoryQuestion | null>(null);
  const [theoryForm, setTheoryForm] = useState(emptyTheory);
  const [previewOpen, setPreviewOpen] = useState(false);

  // bulk upload
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const isTheory = exam?.exam_type === "theory";
  const attempts = embeddedCount(exam?.exam_attempts);

  const load = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    const { data: e, error } = await db
      .from("exams")
      .select("*, subjects(name), classes(name), exam_attempts(count)")
      .eq("id", examId)
      .maybeSingle();
    if (error || !e) { setNotFound(true); setLoading(false); return; }
    setExam(e as ExamRow);
    if ((e as ExamRow).exam_type === "theory") {
      const { data } = await db.from("theory_questions").select("*").eq("exam_id", examId).order("question_order");
      setTheory((data as TheoryQuestion[]) || []);
    } else {
      const { data } = await db.from("questions").select("*").eq("exam_id", examId).order("question_order").order("created_at");
      setMcq((data as McqQuestion[]) || []);
    }
    setLoading(false);
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  // ═════════ Multiple choice ═════════
  const openAddMcq = () => { if (!canCreateExam()) return; setEditingMcq(null); setMcqForm(emptyMcq); setMcqDialog(true); };
  const openEditMcq = (q: McqQuestion) => {
    setEditingMcq(q);
    setMcqForm({
      question_text: q.question_text, option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d, correct_option: (q.correct_option || "A").toUpperCase(),
    });
    setMcqDialog(true);
  };

  const saveMcq = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canCreateExam()) return;
    const f = mcqForm;
    if (!f.question_text.trim()) { toast.error("Please type the question"); return; }
    if (![f.option_a, f.option_b, f.option_c, f.option_d].every((o) => o.trim())) { toast.error("Fill in all four options (A–D)"); return; }
    setBusy(true);
    const row = {
      question_text: f.question_text.trim(), option_a: f.option_a.trim(), option_b: f.option_b.trim(),
      option_c: f.option_c.trim(), option_d: f.option_d.trim(), correct_option: f.correct_option,
    };
    const { error } = editingMcq
      ? await db.from("questions").update(row).eq("id", editingMcq.id)
      : await db.from("questions").insert({ ...row, exam_id: examId, question_order: (mcq.reduce((m, q) => Math.max(m, q.question_order || 0), 0)) + 1 });
    setBusy(false);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success(editingMcq ? "Question updated" : "Question added");
    setMcqDialog(false);
    await load();
  };

  const moveMcq = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= mcq.length) return;
    const next = [...mcq];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((q, k) => ({ ...q, question_order: k + 1 }));
    setMcq(renumbered);
    const changed = renumbered.filter((q, k) => q.question_order !== mcq[k]?.question_order || q.id !== mcq[k]?.id);
    const results = await Promise.all(changed.map((q) => db.from("questions").update({ question_order: q.question_order }).eq("id", q.id)));
    if (results.some((r: any) => r.error)) { toast.error("Could not save the new order"); await load(); }
  };

  // bulk upload
  const parsed = useMemo(() => (bulkText.trim() ? parseQuestionsCsv(bulkText) : null), [bulkText]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkText(await file.text());
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exam-questions-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBulk = async () => {
    if (!parsed || parsed.questions.length === 0) return;
    if (!canCreateExam()) return;
    setBusy(true);
    const start = mcq.reduce((m, q) => Math.max(m, q.question_order || 0), 0);
    const rows = parsed.questions.map((q: ParsedQuestion, i: number) => ({ ...q, exam_id: examId, question_order: start + i + 1 }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("questions").insert(rows.slice(i, i + 100));
      if (error) {
        setBusy(false);
        toast.error(`${friendlyExamError(error.message)} (${i} of ${rows.length} were added before the problem)`);
        await load();
        return;
      }
    }
    setBusy(false);
    toast.success(`${rows.length} question${rows.length === 1 ? "" : "s"} uploaded`);
    setBulkOpen(false);
    setBulkText("");
    await load();
  };

  // ═════════ Theory ═════════
  const nextTheoryNumber = () => {
    const nums = theory.map((t) => parseInt(t.question_number, 10)).filter((n) => !isNaN(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1);
  };
  const openAddTheory = () => {
    if (!canCreateExam()) return;
    setEditingTheory(null);
    setTheoryForm({ ...emptyTheory, question_number: nextTheoryNumber() });
    setTheoryDialog(true);
  };
  const openEditTheory = (q: TheoryQuestion) => {
    setEditingTheory(q);
    setTheoryForm({ question_number: q.question_number, sub_label: q.sub_label || "", question_text: q.question_text, marks: String(q.marks) });
    setTheoryDialog(true);
  };

  const saveTheory = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canCreateExam()) return;
    const f = theoryForm;
    const marks = parseFloat(f.marks);
    if (!f.question_number.trim()) { toast.error("Enter the question number"); return; }
    if (!f.question_text.trim()) { toast.error("Please type the question"); return; }
    if (isNaN(marks) || marks < 0) { toast.error("Enter the marks (0 or more)"); return; }
    setBusy(true);
    const row = {
      question_number: f.question_number.trim(), sub_label: f.sub_label.trim() || null,
      question_text: f.question_text.trim(), marks,
    };
    const { error } = editingTheory
      ? await db.from("theory_questions").update(row).eq("id", editingTheory.id)
      : await db.from("theory_questions").insert({ ...row, exam_id: examId, question_order: theory.reduce((m, q) => Math.max(m, q.question_order || 0), 0) + 1 });
    setBusy(false);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success(editingTheory ? "Question updated" : "Question added");
    setTheoryDialog(false);
    await load();
  };

  const moveTheory = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= theory.length) return;
    const next = [...theory];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((q, k) => ({ ...q, question_order: k + 1 }));
    setTheory(renumbered);
    const results = await Promise.all(renumbered.map((q) => db.from("theory_questions").update({ question_order: q.question_order }).eq("id", q.id)));
    if (results.some((r: any) => r.error)) { toast.error("Could not save the new order"); await load(); }
  };

  // ═════════ Shared ═════════
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const { error } = await db.from(isTheory ? "theory_questions" : "questions").delete().eq("id", deleteTarget.id);
    setBusy(false);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success("Question deleted");
    setDeleteTarget(null);
    await load();
  };

  const regrade = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("regrade_exam", { _exam_id: examId });
    setBusy(false);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success(`Re-graded ${data ?? 0} submitted attempt${data === 1 ? "" : "s"}`);
  };

  // ── Render ────────────────────────────────────────────────────
  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (notFound || !exam) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">This exam wasn't found, or it isn't one of yours.</p>
        <Button onClick={() => navigate(`${base}/exams`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to exams</Button>
      </CardContent></Card>
    );
  }

  const count = isTheory ? theory.length : mcq.length;
  const totalMarks = theory.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  const status = examStatus(exam);

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(`${base}/exams`)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />All exams
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.subjects?.name || "—"} · {exam.classes?.name || "All classes"} · {exam.duration_minutes} min
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{isTheory ? "Theory" : "Multiple choice"}</Badge>
            <Badge variant={exam.is_published ? "default" : "secondary"}>{STATUS_LABEL[status]}</Badge>
          </div>
        </div>
      </div>

      {!isTheory && attempts > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{attempts} student{attempts === 1 ? " has" : "s have"} already taken this exam. If you correct an answer, press <b>Re-grade</b> so their scores follow the new answer.</span>
          </p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void regrade()}><RotateCcw className="mr-1.5 h-4 w-4" />Re-grade</Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {isTheory ? (
          <>
            <Button onClick={openAddTheory}><Plus className="mr-2 h-4 w-4" />Add question</Button>
            <Button variant="outline" disabled={theory.length === 0} onClick={() => setPreviewOpen(true)}><Eye className="mr-2 h-4 w-4" />Preview &amp; print</Button>
          </>
        ) : (
          <>
            <Button onClick={openAddMcq}><Plus className="mr-2 h-4 w-4" />Add question</Button>
            <Button variant="outline" onClick={() => { if (canCreateExam()) setBulkOpen(true); }}><Upload className="mr-2 h-4 w-4" />Upload questions</Button>
            <Button variant="ghost" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Template</Button>
          </>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {count} question{count === 1 ? "" : "s"}{isTheory ? ` · ${totalMarks} marks` : ""}
        </span>
      </div>

      {/* List */}
      {count === 0 ? (
        <Card><CardContent className="space-y-2 py-12 text-center text-muted-foreground">
          <p className="font-medium">No questions yet</p>
          <p className="text-sm">{isTheory ? "Add the questions of your question paper." : "Add questions one by one, or upload many at once from a CSV file or an Excel paste."}</p>
        </CardContent></Card>
      ) : isTheory ? (
        <div className="space-y-2">
          {theory.map((q, i) => (
            <Card key={q.id} className="border-0 shadow-sm">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="min-w-[44px] pt-0.5 font-bold">{q.question_number}{q.sub_label ? `(${q.sub_label})` : ""}</div>
                <p className="flex-1 whitespace-pre-wrap break-words text-sm">{q.question_text}</p>
                <Badge variant="secondary" className="shrink-0">{q.marks} mk</Badge>
                <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => void moveTheory(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === theory.length - 1} onClick={() => void moveTheory(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditTheory(q)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ id: q.id, label: `Question ${q.question_number}${q.sub_label ? `(${q.sub_label})` : ""}` })} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {mcq.map((q, i) => (
            <Card key={q.id} className="border-0 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                  <p className="flex-1 whitespace-pre-wrap break-words font-medium">{q.question_text}</p>
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => void moveMcq(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === mcq.length - 1} onClick={() => void moveMcq(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditMcq(q)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ id: q.id, label: `Question ${i + 1}` })} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {LETTERS.map((l) => {
                    const correct = (q.correct_option || "").toUpperCase() === l;
                    return (
                      <div key={l} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                        correct && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10")}>
                        <span className="font-bold">{l}.</span>
                        <span className="flex-1 break-words">{q[optKey(l)]}</span>
                        {correct && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" />}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MCQ add / edit */}
      <Dialog open={mcqDialog} onOpenChange={setMcqDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingMcq ? "Edit question" : "Add question"}</DialogTitle></DialogHeader>
          <form onSubmit={saveMcq} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcq-question">Question *</Label>
              <Textarea id="mcq-question" rows={3} value={mcqForm.question_text} onChange={(e) => setMcqForm({ ...mcqForm, question_text: e.target.value })} required />
            </div>
            {LETTERS.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMcqForm({ ...mcqForm, correct_option: l })}
                  aria-label={`Mark option ${l} as the correct answer`}
                  aria-pressed={mcqForm.correct_option === l}
                  className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition",
                    mcqForm.correct_option === l ? "border-emerald-600 bg-emerald-600 text-white" : "hover:border-emerald-500")}
                >
                  {l}
                </button>
                <Input value={mcqForm[optKey(l)]} onChange={(e) => setMcqForm({ ...mcqForm, [optKey(l)]: e.target.value })} placeholder={`Option ${l}`} required />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Tap a letter to mark it as the correct answer (currently <b>{mcqForm.correct_option}</b>).</p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setMcqDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingMcq ? "Save" : "Add question"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk upload */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) setBulkText(""); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload questions</DialogTitle>
            <DialogDescription>
              One question per row with 6 columns: <b>question, option A, option B, option C, option D, correct answer (A–D)</b>.
              Choose a CSV file, or paste rows copied from Excel / Google Sheets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={onPickFile} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Choose file</Button>
              <Button type="button" variant="ghost" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Download template</Button>
            </div>
            <Textarea
              rows={8}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"What is 2 + 2?\t3\t4\t5\t6\tB\nCapital of Nigeria?\tLagos\tAbuja\tKano\tIbadan\tB"}
              className="font-mono text-xs"
              aria-label="Questions to upload"
            />
            {parsed && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className={parsed.questions.length ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-red-600"}>
                  {parsed.questions.length} question{parsed.questions.length === 1 ? "" : "s"} ready to upload
                  {parsed.errors.length > 0 && ` · ${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} need attention`}
                </p>
                {parsed.errors.length > 0 && (
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-600 dark:text-red-400">
                    {parsed.errors.slice(0, 30).map((er, i) => <li key={i}>{er}</li>)}
                    {parsed.errors.length > 30 && <li>…and {parsed.errors.length - 30} more</li>}
                  </ul>
                )}
                {parsed.questions.length > 0 && parsed.errors.length > 0 && (
                  <p className="text-xs text-muted-foreground">Rows with problems are skipped. Fix them and upload again, or continue with the valid ones.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button disabled={busy || !parsed || parsed.questions.length === 0} onClick={() => void importBulk()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload {parsed?.questions.length ? parsed.questions.length : ""} question{parsed?.questions.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theory add / edit */}
      <Dialog open={theoryDialog} onOpenChange={setTheoryDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingTheory ? "Edit question" : "Add question"}</DialogTitle></DialogHeader>
          <form onSubmit={saveTheory} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="th-number">Number *</Label>
                <Input id="th-number" value={theoryForm.question_number} onChange={(e) => setTheoryForm({ ...theoryForm, question_number: e.target.value })} placeholder="1" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="th-part">Part</Label>
                <Input id="th-part" value={theoryForm.sub_label} onChange={(e) => setTheoryForm({ ...theoryForm, sub_label: e.target.value })} placeholder="a" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="th-marks">Marks *</Label>
                <Input id="th-marks" type="number" min={0} step="0.5" value={theoryForm.marks} onChange={(e) => setTheoryForm({ ...theoryForm, marks: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="th-question">Question *</Label>
              <Textarea id="th-question" rows={5} value={theoryForm.question_text} onChange={(e) => setTheoryForm({ ...theoryForm, question_text: e.target.value })} required />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setTheoryDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingTheory ? "Save" : "Add question"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Theory preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Question paper</DialogTitle></DialogHeader>
          <TheoryPaperView
            data={{
              title: exam.title, subjectName: exam.subjects?.name, className: exam.classes?.name,
              durationMinutes: exam.duration_minutes, instructions: exam.instructions,
              schoolName: schoolName, logoUrl: logoUrl || undefined, questions: theory,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete {deleteTarget?.label}?</DialogTitle>
            <DialogDescription>
              {!isTheory && attempts > 0
                ? "Students have already taken this exam. Deleting a question changes the total, so press Re-grade afterwards."
                : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
