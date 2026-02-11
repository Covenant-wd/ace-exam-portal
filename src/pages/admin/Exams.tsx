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

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_published: boolean;
  subject_id: string;
  subjects?: { name: string };
}

interface Subject {
  id: string;
  name: string;
}

export default function Exams() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [duration, setDuration] = useState("30");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [examsRes, subjectsRes] = await Promise.all([
      supabase.from("exams").select("*, subjects(name)").order("created_at", { ascending: false }),
      supabase.from("subjects").select("id, name").order("name"),
    ]);
    setExams((examsRes.data as any[]) ?? []);
    setSubjects((subjectsRes.data as Subject[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!title.trim() || !subjectId) { toast.error("Title and subject are required"); return; }
    setSaving(true);
    const payload = { title, description, subject_id: subjectId, duration_minutes: parseInt(duration) || 30, is_published: isPublished, created_by: user?.id };
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
    await supabase.from("exams").update({ is_published: !exam.is_published }).eq("id", exam.id);
    fetchData();
  };

  const reset = () => { setEditing(null); setTitle(""); setDescription(""); setSubjectId(""); setDuration("30"); setIsPublished(false); };

  const openEdit = (e: Exam) => {
    setEditing(e); setTitle(e.title); setDescription(e.description || ""); setSubjectId(e.subject_id); setDuration(String(e.duration_minutes)); setIsPublished(e.is_published); setOpen(true);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Exams</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={reset}><Plus className="mr-2 h-4 w-4" />Create Exam</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Exam" : "New Exam"}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Subject</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-term Exam" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="1" /></div>
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
              <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead><TableHead className="w-32">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {exams.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.title}</TableCell>
                    <TableCell>{(e as any).subjects?.name || "—"}</TableCell>
                    <TableCell>{e.duration_minutes} min</TableCell>
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
