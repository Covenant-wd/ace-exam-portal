import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Search, Users, ArrowRightLeft } from "lucide-react";


interface Student {
  user_id: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  username: string | null;
  class_name: string | null;
  class_id: string | null;
  date_of_birth: string | null;
  address: string;
  parent_name: string;
  nationality: string;
  gender: string;
  subjects_offered: string[];
  full_name: string;
}

interface ClassItem { id: string; name: string; }

const emptyForm = {
  email: "", password: "", first_name: "", middle_name: "", last_name: "",
  username: "", class_id: "", date_of_birth: "", address: "",
  parent_name: "", nationality: "", subjects_offered: "", gender: "",
};

export default function Students() {
  const { schoolId, session } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Promotion state
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoFrom, setPromoFrom] = useState("");
  const [promoTo, setPromoTo] = useState("");
  const [promoSaving, setPromoSaving] = useState(false);

  // Individual move state
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [moveToClass, setMoveToClass] = useState("");

  const fetchStudents = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [profilesRes, classesRes] = await Promise.all([
        supabase
          .from("student_list_view")
          .select("*")
          .eq("school_id", schoolId)
          .order("full_name"),
        supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
      ]);
      setStudents((profilesRes.data || []).map((p: any) => ({ ...p, email: p.email || "" })));
      setClasses(classesRes.data ?? []);
    } catch (err: any) {
      toast.error("Failed to load students");
    }
    setLoading(false);
  };

  useEffect(() => { if (schoolId) fetchStudents(); }, [schoolId]);

  const getClassName = (classId: string | null) => {
    if (!classId) return "—";
    return classes.find((c) => c.id === classId)?.name || "—";
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      email: s.email, password: "",
      first_name: s.first_name || "", middle_name: s.middle_name || "",
      last_name: s.last_name || "", username: s.username || "",
      class_id: s.class_id || "", date_of_birth: s.date_of_birth || "",
      address: s.address || "", parent_name: s.parent_name || "",
      nationality: s.nationality || "", gender: s.gender || "",
      subjects_offered: (s.subjects_offered || []).join(", "),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) { toast.error("First name, last name and email are required"); return; }
    if (!editing && !form.password) { toast.error("Password is required for new students"); return; }
    setSaving(true);
    const subjects = form.subjects_offered.split(",").map(s => s.trim()).filter(Boolean);
    const payload: any = {
      action: editing ? "update" : "create",
      ...form,
      class_id: form.class_id || null,
      date_of_birth: form.date_of_birth || null,
      subjects_offered: subjects,
    };
    if (editing) {
      payload.user_id = editing.user_id;
      if (!form.password) delete payload.password;
    }
    const res = await supabase.functions.invoke("manage-student", { body: payload, headers: { Authorization: `Bearer ${session?.access_token}` } });
    setSaving(false);
    if (res.error || res.data?.error) { toast.error(res.data?.error || "Operation failed"); return; }
    toast.success(editing ? "Student updated" : "Student created");
    setDialogOpen(false);
    fetchStudents();
  };

  const handleBulkPromote = async () => {
    if (!promoFrom || !promoTo) { toast.error("Select both classes"); return; }
    if (promoFrom === promoTo) { toast.error("Source and destination must differ"); return; }
    setPromoSaving(true);
    const { error } = await supabase.from("profiles").update({ class_id: promoTo }).eq("class_id", promoFrom).eq("school_id", schoolId!);
    setPromoSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Students promoted successfully");
    setPromoOpen(false);
    fetchStudents();
  };

  const handleMoveStudents = async () => {
    if (!moveToClass || selectedStudents.length === 0) { toast.error("Select students and target class"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ class_id: moveToClass }).in("user_id", selectedStudents).eq("school_id", schoolId!);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedStudents.length} student(s) moved`);
    setMoveOpen(false); setSelectedStudents([]);
    fetchStudents();
  };

  const toggleStudentSelect = (userId: string) => {
    setSelectedStudents((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q);
  });

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">{students.length} student{students.length !== 1 ? "s" : ""} registered</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSelectedStudents([]); setMoveToClass(""); setMoveOpen(true); }}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />Move Students
          </Button>
          <Button variant="outline" onClick={() => { setPromoFrom(""); setPromoTo(""); setPromoOpen(true); }}>
            Bulk Promote
          </Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Student</Button>
        </div>
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
                  <TableHead>Gender</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />No students found
                  </TableCell></TableRow>
                ) : filtered.map((s, i) => (
                  <TableRow key={s.user_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                    <TableCell>{s.username || "—"}</TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>{s.gender || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{getClassName(s.class_id)}</Badge></TableCell>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Student" : "Add New Student"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.first_name} onChange={set("first_name")} required /></div>
            <div className="space-y-1.5"><Label>Middle Name</Label><Input value={form.middle_name} onChange={set("middle_name")} /></div>
            <div className="space-y-1.5"><Label>Last Name *</Label><Input value={form.last_name} onChange={set("last_name")} required /></div>
            <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={set("username")} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={set("email")} required /></div>
            <div className="space-y-1.5"><Label>{editing ? "New Password (leave blank to keep)" : "Password *"}</Label><Input type="password" value={form.password} onChange={set("password")} required={!editing} /></div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm((p) => ({ ...p, class_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></div>
            <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={set("nationality")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
            <div className="space-y-1.5"><Label>Parent's Name</Label><Input value={form.parent_name} onChange={set("parent_name")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Subjects Offered (comma-separated)</Label><Input value={form.subjects_offered} onChange={set("subjects_offered")} placeholder="e.g. Mathematics, English, Physics" /></div>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Update" : "Create"} Student</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Promote Dialog */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Promote Students</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move all students from one class to another (e.g. at end of session).</p>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>From Class</Label>
              <Select value={promoFrom} onValueChange={setPromoFrom}>
                <SelectTrigger><SelectValue placeholder="Source class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Class</Label>
              <Select value={promoTo} onValueChange={setPromoTo}>
                <SelectTrigger><SelectValue placeholder="Destination class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleBulkPromote} className="w-full" disabled={promoSaving}>
              {promoSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Promote All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Individual Move Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Move Students to Class</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Target Class</Label>
              <Select value={moveToClass} onValueChange={setMoveToClass}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Students ({selectedStudents.length} selected)</Label>
              <div className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-1">
                {students.map((s) => (
                  <label key={s.user_id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted">
                    <Checkbox checked={selectedStudents.includes(s.user_id)} onCheckedChange={() => toggleStudentSelect(s.user_id)} />
                    <span>{s.full_name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">{getClassName(s.class_id)}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleMoveStudents} className="w-full" disabled={saving || selectedStudents.length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Move {selectedStudents.length} Student(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
