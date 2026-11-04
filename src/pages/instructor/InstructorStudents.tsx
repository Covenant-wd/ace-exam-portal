// src/pages/instructor/InstructorStudents.tsx
// Students page for instructors who hold the "Manage students" permission.
// Everything here is scoped to the classes assigned to the instructor, and
// every write goes through a server-side check (instructor_* RPCs), so the
// permission cannot be bypassed from the browser.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Loader2, Plus, Pencil, Search, Users, ArrowRightLeft, Eye, EyeOff, Trash2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/hooks/useSubscription";
import { useInstructorPermissions } from "@/hooks/useInstructorPermissions";
import { sendStudentWelcomeEmail, isNotificationEnabled } from "@/lib/email";
import { useSchoolName } from "@/hooks/useSchoolSettings";
import { isPlaceholderEmail } from "@/lib/utils";

interface Student {
  user_id: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  username: string | null;
  class_id: string | null;
  date_of_birth: string | null;
  address: string;
  parent_name: string;
  nationality: string;
  gender: string;
  subjects_offered: string[];
  full_name: string;
  phone_number: string | null;
}

interface ClassItem { id: string; name: string; }

const emptyForm = {
  email: "", password: "", first_name: "", middle_name: "", last_name: "",
  username: "", class_id: "", date_of_birth: "", address: "",
  parent_name: "", nationality: "", subjects_offered: "", gender: "",
  phone_number: "",
};

export default function InstructorStudents() {
  const { user, schoolId } = useAuth();
  const { schoolName } = useSchoolName();
  const { canAddStudent } = useSubscription();
  const { permissions, loading: permLoading } = useInstructorPermissions();

  const canManage = !!permissions?.can_manage_students;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  // Add / edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Promote
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoFrom, setPromoFrom] = useState("");
  const [promoTo, setPromoTo] = useState("");
  const [promoSaving, setPromoSaving] = useState(false);

  // Move
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [moveToClass, setMoveToClass] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [delSaving, setDelSaving] = useState(false);

  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);

  const load = useCallback(async () => {
    if (!user || !schoolId) return;
    setLoading(true);
    try {
      // Classes assigned to this instructor — legacy table + new class_instructors table
      const [legacyRes, newRes] = await Promise.all([
        (supabase as any)
          .from("instructor_classes")
          .select("class_id, classes:class_id(id, name)")
          .eq("instructor_id", user.id),
        (supabase as any)
          .from("class_instructors")
          .select("class_id, classes:class_id(id, name)")
          .eq("instructor_id", user.id),
      ]);

      const map = new Map<string, ClassItem>();
      for (const res of [legacyRes, newRes]) {
        for (const r of (res?.data || []) as any[]) {
          const c = r.classes;
          if (c?.id) map.set(c.id, { id: c.id, name: c.name });
        }
      }
      const assigned = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setClasses(assigned);

      if (assigned.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("school_id", schoolId)
        .in("class_id", assigned.map((c) => c.id))
        .order("full_name");

      if (error) {
        toast.error(error.message);
        setStudents([]);
      } else {
        setStudents((data || []).map((p: any) => ({ ...p, email: p.email || "" })));
      }
    } catch (err: any) {
      toast.error("Failed to load: " + err.message);
    }
    setLoading(false);
  }, [user, schoolId]);

  useEffect(() => { if (canManage) load(); else if (!permLoading) setLoading(false); }, [canManage, permLoading, load]);

  const getClassName = (classId: string | null) =>
    (classId && classes.find((c) => c.id === classId)?.name) || "—";

  // ── Add / Edit ────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, class_id: classes.length === 1 ? classes[0].id : (classFilter !== "all" ? classFilter : "") });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      email: isPlaceholderEmail(s.email) ? "" : s.email, password: "",
      first_name: s.first_name || "", middle_name: s.middle_name || "",
      last_name: s.last_name || "", username: s.username || "",
      class_id: s.class_id || "", date_of_birth: s.date_of_birth || "",
      address: s.address || "", parent_name: s.parent_name || "",
      nationality: s.nationality || "", gender: s.gender || "",
      subjects_offered: (s.subjects_offered || []).join(", "),
      phone_number: s.phone_number || "",
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddStudent()) return;
    if (!form.first_name.trim() || !form.last_name.trim()) { toast.error("First name and last name are required"); return; }
    if (!form.email.trim() && !form.username.trim()) { toast.error("Provide an email or a username so the student can sign in"); return; }
    if (!form.class_id) { toast.error("Please choose a class"); return; }
    if (!editing && !form.gender) { toast.error("Please select the student's gender"); return; }
    if (!editing && !form.password) { toast.error("Password is required for new students"); return; }

    setSaving(true);
    const subjects = form.subjects_offered.split(",").map((s) => s.trim()).filter(Boolean);
    const fullName = [form.first_name, form.middle_name, form.last_name]
      .map((p) => (p || "").trim()).filter(Boolean).join(" ");

    try {
      if (editing) {
        const { error } = await (supabase as any).rpc("instructor_update_student", {
          _user_id: editing.user_id,
          _email: form.email.trim() || null,
          _password: form.password || null,
          _first_name: form.first_name,
          _middle_name: form.middle_name || "",
          _last_name: form.last_name,
          _username: form.username || null,
          _class_id: form.class_id,
          _date_of_birth: form.date_of_birth || null,
          _address: form.address || "",
          _parent_name: form.parent_name || "",
          _nationality: form.nationality || "",
          _gender: form.gender || "",
          _subjects_offered: subjects,
          _phone_number: form.phone_number.trim() || null,
        } as any);
        if (error) throw new Error(error.message);
        toast.success("Student updated");
      } else {
        const { data: newUserId, error } = await (supabase as any).rpc("instructor_create_student", {
          _email: form.email.trim() ? form.email.trim().toLowerCase() : null,
          _password: form.password,
          _first_name: form.first_name,
          _middle_name: form.middle_name || "",
          _last_name: form.last_name,
          _username: form.username || null,
          _class_id: form.class_id,
          _date_of_birth: form.date_of_birth || null,
          _address: form.address || "",
          _parent_name: form.parent_name || "",
          _nationality: form.nationality || "",
          _gender: form.gender || "",
          _subjects_offered: subjects,
          _phone_number: form.phone_number.trim() || null,
        } as any);
        if (error) throw new Error(error.message);
        if (!newUserId) throw new Error("Failed to create student account.");
        toast.success("Student created");

        if (form.email.trim() && schoolId) {
          isNotificationEnabled(schoolId, "notify_welcome_email").then((enabled) => {
            if (!enabled) return;
            sendStudentWelcomeEmail({
              to: form.email.trim().toLowerCase(),
              studentName: fullName,
              schoolName: schoolName || document.title || "School",
              loginUrl: window.location.origin,
              password: form.password,
              username: form.username || undefined,
            }).catch(() => {});
          });
        }
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    }
    setSaving(false);
  };

  // ── Move / Promote ────────────────────────────────────────────
  const handleMoveStudents = async () => {
    if (!canAddStudent()) return;
    if (!moveToClass || selectedStudents.length === 0) { toast.error("Select students and a target class"); return; }
    setMoveSaving(true);
    const { error } = await (supabase as any).rpc("instructor_move_students", {
      _user_ids: selectedStudents, _class_id: moveToClass,
    } as any);
    setMoveSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedStudents.length} student(s) moved`);
    setMoveOpen(false);
    setSelectedStudents([]);
    load();
  };

  const handleBulkPromote = async () => {
    if (!canAddStudent()) return;
    if (!promoFrom || !promoTo) { toast.error("Select both classes"); return; }
    if (promoFrom === promoTo) { toast.error("Source and destination must differ"); return; }
    const ids = students.filter((s) => s.class_id === promoFrom).map((s) => s.user_id);
    if (ids.length === 0) { toast.error("There are no students in the source class"); return; }
    setPromoSaving(true);
    const { error } = await (supabase as any).rpc("instructor_move_students", { _user_ids: ids, _class_id: promoTo } as any);
    setPromoSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} student(s) promoted`);
    setPromoOpen(false);
    load();
  };

  const toggleStudentSelect = (id: string) =>
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ── Delete ────────────────────────────────────────────────────
  const openDelete = (s: Student) => { setDeleting(s); setDeleteConfirm(""); setDeleteOpen(true); };

  const handleDelete = async () => {
    if (!deleting) return;
    if (deleteConfirm !== deleting.full_name) { toast.error("Name does not match"); return; }
    setDelSaving(true);
    const { error } = await (supabase as any).rpc("instructor_delete_student", { _user_id: deleting.user_id } as any);
    setDelSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Student permanently deleted");
    setStudents((prev) => prev.filter((s) => s.user_id !== deleting.user_id));
    setDeleteOpen(false);
    setDeleting(null);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q);
    const matchesClass = classFilter === "all" || s.class_id === classFilter;
    return matchesSearch && matchesClass;
  });

  // ── Render ────────────────────────────────────────────────────
  if (permLoading || loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!canManage) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Lock className="h-8 w-8 opacity-50" />
          <p className="font-medium">You don't have permission to manage students.</p>
          <p className="text-sm">Ask your school admin to enable "Manage students" for your account.</p>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 opacity-50" />
          <p className="font-medium">You haven't been assigned to a class yet.</p>
          <p className="text-sm">Ask your school admin to assign you to a class to manage its students.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">
            {students.length} student{students.length !== 1 ? "s" : ""} in {classes.length} class{classes.length !== 1 ? "es" : ""} assigned to you
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {classes.length > 1 && (
            <>
              <Button variant="outline" onClick={() => { setSelectedStudents([]); setMoveToClass(""); setMoveOpen(true); }}>
                <ArrowRightLeft className="mr-2 h-4 w-4" />Move Students
              </Button>
              <Button variant="outline" onClick={() => { setPromoFrom(""); setPromoTo(""); setPromoOpen(true); }}>
                Bulk Promote
              </Button>
            </>
          )}
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Student</Button>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            {classes.length > 1 && (
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="sm:w-52"><SelectValue placeholder="All my classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All my classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />No students found
                    </TableCell>
                  </TableRow>
                ) : filtered.map((s, i) => (
                  <TableRow key={s.user_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                    <TableCell>{s.username || "—"}</TableCell>
                    <TableCell>{isPlaceholderEmail(s.email) ? "—" : s.email}</TableCell>
                    <TableCell>{s.gender || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{getClassName(s.class_id)}</Badge></TableCell>
                    <TableCell>{s.nationality || "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => openDelete(s)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Student" : "Add New Student"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.first_name} onChange={set("first_name")} required /></div>
            <div className="space-y-1.5"><Label>Middle Name</Label><Input value={form.middle_name} onChange={set("middle_name")} /></div>
            <div className="space-y-1.5"><Label>Last Name *</Label><Input value={form.last_name} onChange={set("last_name")} required /></div>
            <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={set("username")} /></div>
            <div className="space-y-1.5"><Label>Email (optional if username is set)</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
            <div className="space-y-1.5">
              <Label>{editing ? "New Password (leave blank to keep)" : "Password *"}</Label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")} required={!editing} className="pr-10" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Gender{!editing && " *"}</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm((p) => ({ ...p, class_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></div>
            <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={set("nationality")} /></div>
            <div className="space-y-1.5"><Label>Phone Number</Label><Input value={form.phone_number} onChange={set("phone_number")} /></div>
            <div className="space-y-1.5"><Label>Parent's Name</Label><Input value={form.parent_name} onChange={set("parent_name")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Subjects Offered (comma-separated)</Label><Input value={form.subjects_offered} onChange={set("subjects_offered")} placeholder="e.g. Mathematics, English, Physics" /></div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Update" : "Create"} Student</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Promote */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Promote Students</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move all students from one of your classes to another (e.g. at end of session).</p>
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

      {/* Move */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
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
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
                {students.map((s) => (
                  <label key={s.user_id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted">
                    <Checkbox checked={selectedStudents.includes(s.user_id)} onCheckedChange={() => toggleStudentSelect(s.user_id)} />
                    <span>{s.full_name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">{getClassName(s.class_id)}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleMoveStudents} className="w-full" disabled={moveSaving || selectedStudents.length === 0}>
              {moveSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Move {selectedStudents.length} Student(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">Permanently Delete Student</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              This will <strong>permanently delete</strong> {deleting?.full_name} and all their data including attendance, grades, results and payments. This action <strong>cannot be undone</strong>.
            </p>
            <div className="space-y-1.5">
              <Label>Type <strong>{deleting?.full_name}</strong> to confirm</Label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={deleting?.full_name} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={delSaving || deleteConfirm !== deleting?.full_name}>
                {delSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete Permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
