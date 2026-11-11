// src/pages/admin/Exams.tsx
// Exam manager, shared by admins and teachers (like Attendance and Announcements).
//   • Admin  : every exam in the school, any subject / class.
//   • Teacher: needs the "Create & manage exams" permission, and can only set exams for the
//              subject + class pairs assigned to them (also enforced by the database).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3, CalendarClock, Clock, FileQuestion, ListChecks, Loader2, Lock, Pencil, Plus, RotateCcw, Search, Trash2, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/hooks/useSubscription";
import { useInstructorPermissions } from "@/hooks/useInstructorPermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import InAppCbtGate from "@/components/InAppCbtGate";
import {
  type ExamRow, type ExamStatus, STATUS_LABEL, embeddedCount, examStatus, formatDateTime,
  friendlyExamError, fromLocalInput, toLocalInput,
} from "@/lib/exams";

interface Option { id: string; name: string }

const STATUS_STYLE: Record<ExamStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  closed: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
};

const emptyForm = {
  title: "", description: "", instructions: "", exam_type: "mcq" as "mcq" | "theory",
  class_id: "", subject_id: "", term_id: "none", duration: "30", start: "", end: "",
  allow_retake: false, shuffle: false,
};

export default function Exams() {
  return (
    <InAppCbtGate>
      <ExamsInner />
    </InAppCbtGate>
  );
}

function ExamsInner() {
  const { user, schoolId, role } = useAuth();
  const navigate = useNavigate();
  const isInstructor = role === "instructor";
  const base = isInstructor ? "/instructor" : "/admin";
  const { canCreateExam, canPublishExam } = useSubscription();
  const { permissions, subjectAssignments, loading: permLoading } = useInstructorPermissions();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [terms, setTerms] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ExamRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = !isInstructor || !!permissions?.can_manage_exams;

  // Teachers choose from their own subject+class pairs; admins from everything
  const classOptions: Option[] = useMemo(() => {
    if (!isInstructor) return classes;
    const m = new Map<string, Option>();
    subjectAssignments.forEach((a) => m.set(a.class_id, { id: a.class_id, name: a.class_name }));
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isInstructor, classes, subjectAssignments]);

  const subjectOptions: Option[] = useMemo(() => {
    if (!isInstructor) return subjects;
    return subjectAssignments
      .filter((a) => a.class_id === form.class_id)
      .map((a) => ({ id: a.subject_id, name: a.subject_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isInstructor, subjects, subjectAssignments, form.class_id]);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const db = supabase as any;
    const [examRes, classRes, subjRes, termRes] = await Promise.all([
      db.from("exams")
        .select("*, subjects(name), classes(name), questions(count), theory_questions(count), exam_attempts(count)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
      db.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
      db.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
      db.from("terms").select("id, name").eq("school_id", schoolId).order("name"),
    ]);
    if (examRes.error) toast.error(friendlyExamError(examRes.error.message));
    setExams((examRes.data as ExamRow[]) || []);
    setClasses((classRes.data as Option[]) || []);
    setSubjects((subjRes.data as Option[]) || []);
    setTerms((termRes.data as Option[]) || []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { if (!permLoading && canManage) void load(); else if (!permLoading) setLoading(false); }, [permLoading, canManage, load]);

  const questionCount = (e: ExamRow) => embeddedCount(e.exam_type === "theory" ? e.theory_questions : e.questions);
  const attemptCount = (e: ExamRow) => embeddedCount(e.exam_attempts);

  const filtered = exams.filter((e) => {
    const q = search.trim().toLowerCase();
    if (q && !e.title.toLowerCase().includes(q) && !(e.subjects?.name || "").toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && examStatus(e) !== statusFilter) return false;
    return true;
  });

  // ── Create / edit ─────────────────────────────────────────────
  const openCreate = () => {
    if (!canCreateExam()) return;
    setEditing(null);
    const onlyClass = classOptions.length === 1 ? classOptions[0].id : "";
    setForm({ ...emptyForm, class_id: onlyClass });
    setDialog(true);
  };

  const openEdit = (e: ExamRow) => {
    setEditing(e);
    setForm({
      title: e.title, description: e.description || "", instructions: e.instructions || "",
      exam_type: e.exam_type, class_id: e.class_id || "all", subject_id: e.subject_id,
      term_id: e.term_id || "none", duration: String(e.duration_minutes),
      start: toLocalInput(e.start_date), end: toLocalInput(e.end_date),
      allow_retake: !!e.allow_retake, shuffle: !!e.shuffle_questions,
    });
    setDialog(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!user || !schoolId) return;
    if (!canCreateExam()) return;

    const title = form.title.trim();
    const duration = parseInt(form.duration, 10);
    if (!title) { toast.error("Please enter the exam title"); return; }
    if (!form.class_id) { toast.error("Please choose a class"); return; }
    if (!form.subject_id) { toast.error("Please choose a subject"); return; }
    if (!duration || duration < 1 || duration > 600) { toast.error("Duration must be between 1 and 600 minutes"); return; }
    const start = fromLocalInput(form.start);
    const end = fromLocalInput(form.end);
    if (start && end && new Date(end) <= new Date(start)) { toast.error("The closing time must be after the opening time"); return; }

    const payload = {
      title,
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      exam_type: form.exam_type,
      subject_id: form.subject_id,
      class_id: form.class_id === "all" ? null : form.class_id,
      term_id: form.term_id === "none" ? null : form.term_id,
      duration_minutes: duration,
      start_date: start,
      end_date: end,
      allow_retake: form.exam_type === "mcq" ? form.allow_retake : false,
      shuffle_questions: form.exam_type === "mcq" ? form.shuffle : false,
    };

    setSaving(true);
    const db = supabase as any;
    try {
      if (editing) {
        const { error } = await db.from("exams").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
        toast.success("Exam updated");
        setDialog(false);
        await load();
      } else {
        const { data, error } = await db.from("exams")
          .insert({ ...payload, school_id: schoolId, created_by: user.id, is_published: false })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        toast.success("Exam created — now add the questions");
        setDialog(false);
        navigate(`${base}/exams/${data.id}/${form.exam_type === "theory" ? "theory-questions" : "questions"}`);
      }
    } catch (err: any) {
      toast.error(friendlyExamError(err.message));
    }
    setSaving(false);
  };

  // ── Publish / delete / re-grade ───────────────────────────────
  const togglePublish = async (e: ExamRow) => {
    if (!e.is_published) {
      if (!canPublishExam()) return;
      if (questionCount(e) === 0) { toast.error("Add at least one question before publishing"); return; }
    }
    setBusyId(e.id);
    const { error } = await (supabase as any).from("exams").update({ is_published: !e.is_published }).eq("id", e.id);
    setBusyId(null);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success(e.is_published ? "Exam unpublished — students can no longer see it" : "Exam published — students in the class can now see it");
    await load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    const { error } = await (supabase as any).from("exams").delete().eq("id", deleting.id);
    setBusyId(null);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success("Exam deleted");
    setDeleting(null);
    await load();
  };

  const regrade = async (e: ExamRow) => {
    setBusyId(e.id);
    const { data, error } = await (supabase as any).rpc("regrade_exam", { _exam_id: e.id });
    setBusyId(null);
    if (error) { toast.error(friendlyExamError(error.message)); return; }
    toast.success(`Re-graded ${data ?? 0} submitted attempt${data === 1 ? "" : "s"}`);
    await load();
  };

  // ── Render ────────────────────────────────────────────────────
  if (permLoading || loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (isInstructor && !permissions?.can_manage_exams) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Lock className="h-8 w-8 opacity-50" />
        <p className="font-medium">You don't have permission to manage exams.</p>
        <p className="text-sm">Ask your school admin to enable "Create &amp; manage exams" for your account.</p>
      </CardContent></Card>
    );
  }

  if (isInstructor && subjectAssignments.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Lock className="h-8 w-8 opacity-50" />
        <p className="font-medium">You haven't been assigned a subject and class yet.</p>
        <p className="text-sm">Exams are set for the subject and class assigned to you. Ask your school admin to assign them.</p>
      </CardContent></Card>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Exams</h1>
          <p className="text-muted-foreground">
            {isInstructor ? "Set, upload and publish exams for the subjects and classes assigned to you." : "Set, upload and publish exams for any class."}
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create exam</Button>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search exams…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <FileQuestion className="h-9 w-9 opacity-50" />
          <p className="font-medium">{exams.length === 0 ? "No exams yet" : "No exams match your search"}</p>
          {exams.length === 0 && <Button onClick={openCreate} className="mt-2"><Plus className="mr-2 h-4 w-4" />Create your first exam</Button>}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const status = examStatus(e);
            const qc = questionCount(e);
            const ac = attemptCount(e);
            const busy = busyId === e.id;
            return (
              <Card key={e.id} className="border-0 shadow-md">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">{e.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {e.subjects?.name || "—"} · {e.classes?.name || "All classes"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{e.exam_type === "theory" ? "Theory" : "Multiple choice"}</Badge>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><ListChecks className="h-4 w-4" />{qc} question{qc === 1 ? "" : "s"}</span>
                    <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{e.duration_minutes} min</span>
                    {e.exam_type === "mcq" && <span className="flex items-center gap-1"><Users className="h-4 w-4" />{ac} taken</span>}
                    {(e.start_date || e.end_date) && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-4 w-4" />{formatDateTime(e.start_date)} → {formatDateTime(e.end_date)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button size="sm" onClick={() => navigate(`${base}/exams/${e.id}/${e.exam_type === "theory" ? "theory-questions" : "questions"}`)}>
                      <ListChecks className="mr-1.5 h-4 w-4" />Questions
                    </Button>
                    {e.exam_type === "mcq" && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`${base}/results?exam=${e.id}`)}>
                        <BarChart3 className="mr-1.5 h-4 w-4" />Results
                      </Button>
                    )}
                    {e.exam_type === "mcq" && ac > 0 && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void regrade(e)} title="Re-mark everyone after correcting an answer">
                        <RotateCcw className="mr-1.5 h-4 w-4" />Re-grade
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(e)}>
                      <Trash2 className="mr-1.5 h-4 w-4" />Delete
                    </Button>
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {e.is_published ? "Published" : "Publish"}
                      <Switch checked={e.is_published} disabled={busy} onCheckedChange={() => void togglePublish(e)} aria-label={`Publish ${e.title}`} />
                    </label>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit exam" : "Create exam"}</DialogTitle>
            <DialogDescription>
              {editing ? "Change the exam's details." : "Set up the exam first, then add its questions on the next screen."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exam-title">Exam title *</Label>
              <Input id="exam-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mathematics — First Term Test" required />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v as "mcq" | "theory" })}
                disabled={!!editing && questionCount(editing) > 0}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple choice (taken on screen, auto-marked)</SelectItem>
                  <SelectItem value="theory">Theory (paper shown on screen)</SelectItem>
                </SelectContent>
              </Select>
              {!!editing && questionCount(editing) > 0 && <p className="text-xs text-muted-foreground">The type can't change once questions exist.</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-duration">Duration (minutes) *</Label>
              <Input id="exam-duration" type="number" min={1} max={600} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} required />
            </div>

            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v, subject_id: isInstructor ? "" : form.subject_id })}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {!isInstructor && <SelectItem value="all">All classes</SelectItem>}
                  {classOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })} disabled={isInstructor && !form.class_id}>
                <SelectTrigger><SelectValue placeholder={isInstructor && !form.class_id ? "Choose a class first" : "Select subject"} /></SelectTrigger>
                <SelectContent>
                  {subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Term <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select value={form.term_id} onValueChange={(v) => setForm({ ...form, term_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No term</SelectItem>
                  {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:block" />

            <div className="space-y-1.5">
              <Label>Opens <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Closes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              <p className="text-xs text-muted-foreground">Students can start until this time; a started exam still runs for its full duration.</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Instructions for students <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Answer all questions. No dictionaries." />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            {form.exam_type === "mcq" && (
              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span><span className="font-medium">Allow retake</span><span className="block text-xs text-muted-foreground">Students can start over after submitting</span></span>
                  <Switch checked={form.allow_retake} onCheckedChange={(v) => setForm({ ...form, allow_retake: v })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span><span className="font-medium">Shuffle questions</span><span className="block text-xs text-muted-foreground">Each student gets a different order</span></span>
                  <Switch checked={form.shuffle} onCheckedChange={(v) => setForm({ ...form, shuffle: v })} />
                </label>
              </div>
            )}

            <DialogFooter className="gap-2 sm:col-span-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create & add questions"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete this exam?</DialogTitle>
            <DialogDescription>
              “{deleting?.title}” will be removed together with its questions
              {deleting && attemptCount(deleting) > 0 ? ` and the ${attemptCount(deleting)} student attempt${attemptCount(deleting) === 1 ? "" : "s"} recorded for it` : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busyId === deleting?.id} onClick={() => void confirmDelete()}>
              {busyId === deleting?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
