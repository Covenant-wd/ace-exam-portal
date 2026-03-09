import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Calculator } from "lucide-react";

interface Subject {
  id: string;
  name: string;
  description: string;
  allow_calculator: boolean;
}

export default function Subjects() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowCalculator, setAllowCalculator] = useState(false);

  const fetchSubjects = async () => {
    const { data } = await supabase.from("subjects").select("*").order("created_at", { ascending: false });
    setSubjects((data as Subject[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchSubjects(); }, []);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Subject name is required"); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("subjects").update({ name, description, allow_calculator: allowCalculator } as any).eq("id", editing.id);
      if (error) toast.error(error.message); else toast.success("Subject updated");
    } else {
      const { error } = await supabase.from("subjects").insert({ name, description, created_by: user?.id, allow_calculator: allowCalculator } as any);
      if (error) toast.error(error.message); else toast.success("Subject created");
    }
    setSaving(false);
    setOpen(false);
    setEditing(null);
    setName("");
    setDescription("");
    setAllowCalculator(false);
    fetchSubjects();
    fetchSubjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subject and all its exams?")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchSubjects(); }
  };

  const openEdit = (s: Subject) => {
    setEditing(s); setName(s.name); setDescription(s.description || ""); setAllowCalculator((s as any).allow_calculator ?? false); setOpen(true);
  };

  const openNew = () => {
    setEditing(null); setName(""); setDescription(""); setOpen(true);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Subjects</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Subject</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit Subject" : "New Subject"}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" /></div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : subjects.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No subjects yet. Create your first one!</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead className="w-24">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
