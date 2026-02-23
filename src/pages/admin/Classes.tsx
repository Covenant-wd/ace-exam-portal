import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  description: string;
}

interface Subject {
  id: string;
  name: string;
}

interface ClassSubject {
  class_id: string;
  subject_id: string;
}

export default function Classes() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [classesRes, subjectsRes, csRes] = await Promise.all([
      supabase.from("classes").select("*").order("name"),
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("class_subjects").select("class_id, subject_id"),
    ]);
    setClasses(classesRes.data ?? []);
    setSubjects(subjectsRes.data ?? []);
    setClassSubjects(csRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Class name is required"); return; }
    setSaving(true);

    let classId: string;
    if (editing) {
      const { error } = await supabase.from("classes").update({ name, description }).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      classId = editing.id;
    } else {
      const { data, error } = await supabase.from("classes").insert({ name, description }).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      classId = data.id;
    }

    // Sync class subjects: delete all, re-insert
    await supabase.from("class_subjects").delete().eq("class_id", classId);
    if (selectedSubjects.length > 0) {
      await supabase.from("class_subjects").insert(
        selectedSubjects.map((sid) => ({ class_id: classId, subject_id: sid }))
      );
    }

    toast.success(editing ? "Class updated" : "Class created");
    setSaving(false); setOpen(false); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this class?")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchData(); }
  };

  const openNew = () => { setEditing(null); setName(""); setDescription(""); setSelectedSubjects([]); setOpen(true); };
  const openEdit = (c: ClassItem) => {
    setEditing(c); setName(c.name); setDescription(c.description || "");
    setSelectedSubjects(classSubjects.filter((cs) => cs.class_id === c.id).map((cs) => cs.subject_id));
    setOpen(true);
  };

  const toggleSubject = (subjectId: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    );
  };

  const getSubjectsForClass = (classId: string) => {
    const subjectIds = classSubjects.filter((cs) => cs.class_id === classId).map((cs) => cs.subject_id);
    return subjects.filter((s) => subjectIds.includes(s.id));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Classes</h1>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Class</Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {classes.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No classes yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => {
                  const subs = getSubjectsForClass(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.description || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {subs.length === 0 ? <span className="text-muted-foreground text-sm">None</span> :
                            subs.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Class" : "New Class"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Class Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JSS 1A" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" /></div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Assign Subjects</Label>
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects available. Create subjects first.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-md border p-3">
                  {subjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={selectedSubjects.includes(s.id)} onCheckedChange={() => toggleSubject(s.id)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
