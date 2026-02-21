import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Search, Users } from "lucide-react";

interface Student {
  user_id: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  username: string | null;
  class_name: string | null;
  date_of_birth: string | null;
  address: string;
  parent_name: string;
  nationality: string;
  subjects_offered: string[];
  full_name: string;
}

const emptyForm = {
  email: "", password: "", first_name: "", middle_name: "", last_name: "",
  username: "", class_name: "", date_of_birth: "", address: "",
  parent_name: "", nationality: "", subjects_offered: "",
};

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchStudents = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke("manage-student", {
      body: { action: "list" },
    });
    if (res.error) { toast.error("Failed to load students"); setLoading(false); return; }
    setStudents(res.data.students || []);
    setLoading(false);
  };

  useEffect(() => { fetchStudents(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      email: s.email,
      password: "",
      first_name: s.first_name || "",
      middle_name: s.middle_name || "",
      last_name: s.last_name || "",
      username: s.username || "",
      class_name: s.class_name || "",
      date_of_birth: s.date_of_birth || "",
      address: s.address || "",
      parent_name: s.parent_name || "",
      nationality: s.nationality || "",
      subjects_offered: (s.subjects_offered || []).join(", "),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error("First name, last name and email are required");
      return;
    }
    if (!editing && !form.password) {
      toast.error("Password is required for new students");
      return;
    }
    setSaving(true);
    const subjects = form.subjects_offered.split(",").map(s => s.trim()).filter(Boolean);
    const payload: any = {
      action: editing ? "update" : "create",
      ...form,
      subjects_offered: subjects,
    };
    if (editing) {
      payload.user_id = editing.user_id;
      if (!form.password) delete payload.password;
    }

    const res = await supabase.functions.invoke("manage-student", { body: payload });
    setSaving(false);
    if (res.error || res.data?.error) {
      toast.error(res.data?.error || "Operation failed");
      return;
    }
    toast.success(editing ? "Student updated" : "Student created");
    setDialogOpen(false);
    fetchStudents();
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q) || s.class_name?.toLowerCase().includes(q);
  });

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">{students.length} student{students.length !== 1 ? "s" : ""} registered</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Student</Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />No students found
                  </TableCell></TableRow>
                ) : filtered.map((s, i) => (
                  <TableRow key={s.user_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                    <TableCell>{s.username || "—"}</TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell><Badge variant="secondary">{s.class_name || "—"}</Badge></TableCell>
                    <TableCell>{s.nationality || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Student" : "Add New Student"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.first_name} onChange={set("first_name")} required />
            </div>
            <div className="space-y-1.5">
              <Label>Middle Name</Label>
              <Input value={form.middle_name} onChange={set("middle_name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.last_name} onChange={set("last_name")} required />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={form.username} onChange={set("username")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={set("email")} required />
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "New Password (leave blank to keep)" : "Password *"}</Label>
              <Input type="password" value={form.password} onChange={set("password")} required={!editing} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Input value={form.class_name} onChange={set("class_name")} placeholder="e.g. SS1A" />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={set("address")} />
            </div>
            <div className="space-y-1.5">
              <Label>Parent's Name</Label>
              <Input value={form.parent_name} onChange={set("parent_name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={set("nationality")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Subjects Offered (comma-separated)</Label>
              <Input value={form.subjects_offered} onChange={set("subjects_offered")} placeholder="e.g. Mathematics, English, Physics" />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Update" : "Create"} Student
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
