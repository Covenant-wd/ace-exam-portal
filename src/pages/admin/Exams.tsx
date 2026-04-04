import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, FileQuestion } from "lucide-react";
import { sendExamPublishedEmail, isNotificationEnabled } from "@/lib/email";
import { useSchoolName } from "@/hooks/useSchoolSettings";

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_published: boolean;
  allow_retake: boolean;
  subject_id: string;
  term_id: string | null;
  class_id: string | null;
  subjects?: { name: string };
  terms?: { name: string } | null;
  classes?: { name: string } | null;
}

interface Subject { id: string; name: string; }
interface Term { id: string; name: string; session_id: string; }
interface Session { id: string; name: string; is_active: boolean; }
interface ClassItem { id: string; name: string; }

export default function Exams() {
  const { user, schoolId } = useAuth();
  const { schoolName } = useSchoolName();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [duration, setDuration] = useState("30");
  const [allowRetake, setAllowRetake] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!schoolId) return;
    const [examsRes, subjectsRes, termsRes, sessionsRes, classesRes] = await Promise.all([
      supabase.from("exams").select("*, subjects(name), terms(name), classes(name)").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
      supabase.from("terms").select("id, name, session_id").eq("school_id", schoolId).order("created_at"),
      supabase.from("sessions").select("id, name, is_active").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
    ]);
    setExams((examsRes.data as any[]) ?? []);
    setSubjects((subjectsRes.data as Subject[]) ?? []);
    setTerms((termsRes.data as Term[]) ?? []);
    setSessions((sessionsRes.data as Session[]) ?? []);
    setClasses((classesRes.data as ClassItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [schoolId]);

  const handleSave = async () => {
    if (!title.trim() || !subjectId || !schoolId) { toast.error("Title and subject are required"); return; }
    setSaving(true);
    const payload: any = {
      title, description, subject_id: subjectId,
      duration_minutes: parseInt(duration) || 30,
      is_published: isPublished,
      allow_retake: allowRetake,
      created_by: user?.id,
      term_id: termId || null,
      class_id: classId || null,
      school_id: schoolId,
    };
    if (editing) {
      const { error } = await supabase.from("exams").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else toast.success("Exam updated");
    } else {
      const { error } = await supabase.from("exams").insert(payload);
      if (error) toast.error(error.message); else toast.success("Exam created");
    }
    setSaving(false); setOpen(false); reset(); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exam and all its questions?")) return;
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchData(); }
  };

  const togglePublish = async (exam: Exam) => {
    const newPublished = !exam.is_published;
    await supabase.from("exams").update({ is_published: newPublished }).eq("id", exam.id);
    // Send email notification when publishing
    if (newPublished && schoolId) {
      try {
        const enabled = await isNotificationEnabled(schoolId, "notify_exam_published");
        if (enabled) {
          // Get students in the exam's class (or all students if no class)
          const query = exam.class_id
            ? supabase.rpc("get_school_students_only", { _school_id: schoolId }).then(r => (r.data || []).filter((s: any) => s.class_id === exam.class_id))
            : supabase.rpc("get_school_students_only", { _school_id: schoolId }).then(r => r.data || []);
          const students = await query;
          const userIds = (students as any[]).map((s: any) => s.user_id);
          if (userIds.length > 0) {
            const { data: emails } = await supabase.rpc("get_user_emails_by_ids", { _user_ids: userIds });
            const emailList = (emails || []).map((e: any) => e.email).filter(Boolean);
            const subjectName = subjects.find(s => s.id === exam.subject_id)?.name || "—";
            if (emailList.length > 0) {
              await sendExamPublishedEmail({
                to: emailList, schoolName: schoolName || "School",
                examTitle: exam.title, subjectName,
                durationMinutes: exam.duration_minutes,
                loginUrl: `${window.location.origin}/student/exams`,
              });
            }
          }
        }
      } catch (e) { console.error("Exam published email failed:", e); }
    }
    fetchData();
  };

  const reset = () => { setEditing(null); setTitle(""); setDescription(""); setSubjectId(""); setDuration("30"); setIsPublished(false); setTermId(""); setClassId(""); };

  const openEdit = (e: Exam) => {
    setEditing(e); setTitle(e.title); setDescription(e.description || ""); setSubjectId(e.subject_id);
    setDuration(String(e.duration_minutes)); setIsPublished(e.is_published); setAllowRetake(e.allow_retake ?? false);
    setTermId(e.term_id || ""); setClassId(e.class_id || ""); setOpen(true);
  };

  const getTermLabel = (termId: string | null) => {
    if (!termId) return "—";
    const term = terms.find((t) => t.id === termId);
    if (!term) return "—";
    const session = sessions.find((s) => s.id === term.session_id);
    return `${session?.name || ""} / ${term.name}`;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Exams</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={reset}><Plus className="mr-2 h-4 w-4" />Create Exam</Button></DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Edit Exam" : "New Exam"}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Subject</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="All classes (optional)" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Session / Term</Label>
                <Select value={termId} onValueChange={setTermId}>
                  <SelectTrigger><SelectValue placeholder="Select term (optional)" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => {
                      const sTerms = terms.filter((t) => t.session_id === s.id);
                      return sTerms.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{s.name} / {t.name}</SelectItem>
                      ));
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-term Exam" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="1" /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Allow Retake</p>
                  <p className="text-xs text-muted-foreground">Students can retake this exam after submission</p>
                </div>
                <Switch checked={allowRetake} onCheckedChange={setAllowRetake} />
              </div>
              <div className="flex items-center gap-2"><Switch checked={isPublished} onCheckedChange={setIsPublished} /><Label>Published</Label></div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : exams.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No exams yet. Create one to get started!</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Class</TableHead><TableHead>Term</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead><TableHead className="w-32">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exams.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.title}</TableCell>
                    <TableCell>{(e as any).subjects?.name || "—"}</TableCell>
                    <TableCell>{(e as any).classes?.name || "All"}</TableCell>
                    <TableCell className="text-sm">{getTermLabel(e.term_id)}</TableCell>
                    <TableCell>{e.duration_minutes} min</TableCell>
                    <TableCell>
                      <Switch
                        checked={e.allow_retake ?? false}
                        onCheckedChange={async (v) => {
                          await supabase.from("exams").update({ allow_retake: v } as any).eq("id", e.id);
                          setExams(exams.map(ex => ex.id === e.id ? { ...ex, allow_retake: v } : ex));
                          toast.success(v ? "Retake enabled" : "Retake disabled");
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.is_published ? "default" : "secondary"} className="cursor-pointer" onClick={() => togglePublish(e)}>
                        {e.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild><Link to={`/admin/exams/${e.id}/questions`}><FileQuestion className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
