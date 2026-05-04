import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Shield, School, BookOpen, GraduationCap, X, BookUser } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { sendInstructorWelcomeEmail } from "@/lib/email";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Instructor {
  user_id: string;
  full_name: string;
  email: string;
  permissions: {
    can_manage_exams: boolean;
    can_view_results: boolean;
    can_manage_students: boolean;
    can_manage_subjects: boolean;
    can_mark_attendance: boolean;
    can_manage_grades: boolean;
    can_manage_timetable: boolean;
    can_manage_fees: boolean;
    can_post_announcements: boolean;
  } | null;
  assigned_classes: string[];
  // New role counts (shown as badges in the table)
  subject_count: number;
  class_instructor_count: number;
}

interface ClassItem   { id: string; name: string; }
interface SubjectItem { id: string; name: string; }

interface SubjectAssignment {
  id: string;
  subject_id: string;
  subject_name: string;
  class_id: string;
  class_name: string;
}

interface ClassInstructorAssignment {
  id: string;
  class_id: string;
  class_name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Instructors() {
  const { schoolId } = useAuth();

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [classes,     setClasses]     = useState<ClassItem[]>([]);
  const [subjects,    setSubjects]    = useState<SubjectItem[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── Add/Edit instructor dialog ──────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Instructor | null>(null);
  const [fullName,   setFullName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [saving,     setSaving]     = useState(false);

  // ── Legacy Permissions dialog ───────────────────────────────────
  const [permsOpen,       setPermsOpen]       = useState(false);
  const [permsInstructor, setPermsInstructor] = useState<Instructor | null>(null);
  const [perms, setPerms] = useState({
    can_manage_exams: false, can_view_results: false, can_manage_students: false,
    can_manage_subjects: false, can_mark_attendance: false, can_manage_grades: false,
    can_manage_timetable: false, can_manage_fees: false, can_post_announcements: false,
  });

  // ── Legacy Assign Classes dialog ────────────────────────────────
  const [classesOpen,       setClassesOpen]       = useState(false);
  const [classesInstructor, setClassesInstructor] = useState<Instructor | null>(null);
  const [selectedClasses,   setSelectedClasses]   = useState<string[]>([]);

  // ── NEW: Role Assignments dialog ────────────────────────────────
  // This is where admins assign:
  //   • Subject Instructor role  → instructor teaches a specific subject in a class
  //   • Class Instructor role    → instructor manages an entire class
  const [rolesOpen,         setRolesOpen]         = useState(false);
  const [rolesInstructor,   setRolesInstructor]   = useState<Instructor | null>(null);

  // Subject assignment form state (inside roles dialog)
  const [subjectAssignments,    setSubjectAssignments]    = useState<SubjectAssignment[]>([]);
  const [classInstructorAssignments, setClassInstructorAssignments] = useState<ClassInstructorAssignment[]>([]);
  const [addSubjectClassId,     setAddSubjectClassId]     = useState("");
  const [addSubjectId,          setAddSubjectId]          = useState("");
  const [classSubjects,         setClassSubjects]         = useState<SubjectItem[]>([]);
  const [rolesLoading,          setRolesLoading]          = useState(false);
  const [rolesSaving,           setRolesSaving]           = useState(false);

  // ── Fetch all instructors + their summary data ──────────────────
  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data: roles }     = await supabase.from("user_roles").select("user_id").eq("role", "instructor").eq("school_id", schoolId);
      const instrIds            = (roles || []).map((r: any) => r.user_id);
      const { data: classData } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name");
      const { data: subjData }  = await supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name");
      setClasses(classData  || []);
      setSubjects(subjData  || []);

      if (instrIds.length === 0) { setInstructors([]); setLoading(false); return; }

      const [profilesRes, permsRes, classLinksRes, subjAssignRes, classInstrRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", instrIds).order("full_name"),
        supabase.from("instructor_permissions").select("*").in("instructor_id", instrIds),
        supabase.from("instructor_classes").select("instructor_id, class_id").in("instructor_id", instrIds),
        supabase.from("instructor_subjects").select("instructor_id").in("instructor_id", instrIds),
        supabase.from("class_instructors").select("instructor_id").in("instructor_id", instrIds),
      ]);

      const permsMap     = new Map((permsRes.data || []).map((p: any) => [p.instructor_id, p]));
      const classMap     = new Map<string, string[]>();
      const subjCount    = new Map<string, number>();
      const classInstrCount = new Map<string, number>();

      (classLinksRes.data || []).forEach((l: any) => {
        if (!classMap.has(l.instructor_id)) classMap.set(l.instructor_id, []);
        classMap.get(l.instructor_id)!.push(l.class_id);
      });
      (subjAssignRes.data || []).forEach((r: any) => subjCount.set(r.instructor_id, (subjCount.get(r.instructor_id) || 0) + 1));
      (classInstrRes.data || []).forEach((r: any) => classInstrCount.set(r.instructor_id, (classInstrCount.get(r.instructor_id) || 0) + 1));

      setInstructors((profilesRes.data || []).map((p: any) => ({
        user_id:               p.user_id,
        full_name:             p.full_name,
        email:                 p.email || "",
        permissions:           permsMap.get(p.user_id) || null,
        assigned_classes:      classMap.get(p.user_id) || [],
        subject_count:         subjCount.get(p.user_id) || 0,
        class_instructor_count: classInstrCount.get(p.user_id) || 0,
      })));
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [schoolId]);

  // ── Load an instructor's role assignments into the dialog ───────
  const openRoles = async (i: Instructor) => {
    setRolesInstructor(i);
    setRolesOpen(true);
    setRolesLoading(true);
    setAddSubjectClassId("");
    setAddSubjectId("");

    const [subjRes, classInstrRes] = await Promise.all([
      supabase
        .from("instructor_subjects")
        .select("id, subject_id, class_id, subjects:subject_id(name), classes:class_id(name)")
        .eq("instructor_id", i.user_id)
        .eq("school_id", schoolId!),
      supabase
        .from("class_instructors")
        .select("id, class_id, classes:class_id(name)")
        .eq("instructor_id", i.user_id)
        .eq("school_id", schoolId!),
    ]);

    setSubjectAssignments(
      (subjRes.data || []).map((r: any) => ({
        id:           r.id,
        subject_id:   r.subject_id,
        subject_name: r.subjects?.name ?? "",
        class_id:     r.class_id,
        class_name:   r.classes?.name  ?? "",
      }))
    );
    setClassInstructorAssignments(
      (classInstrRes.data || []).map((r: any) => ({
        id:         r.id,
        class_id:   r.class_id,
        class_name: r.classes?.name ?? "",
      }))
    );
    setRolesLoading(false);
  };

  // When admin picks a class in the "Add Subject" form, load that class's subjects
  useEffect(() => {
    if (!addSubjectClassId) { setClassSubjects(subjects); setAddSubjectId(""); return; }
    const load = async () => {
      // Try class_subjects junction first; fall back to all school subjects
      const { data } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects:subject_id(id, name)")
        .eq("class_id", addSubjectClassId);
      const linked = (data || []).map((r: any) => r.subjects).filter(Boolean);
      setClassSubjects(linked.length > 0 ? linked : subjects);
      setAddSubjectId("");
    };
    load();
  }, [addSubjectClassId, subjects]);

  // ── Add a subject assignment ────────────────────────────────────
  const handleAddSubjectAssignment = async () => {
    if (!addSubjectClassId || !addSubjectId) {
      toast.error("Select both a class and a subject"); return;
    }
    if (subjectAssignments.some(a => a.subject_id === addSubjectId && a.class_id === addSubjectClassId)) {
      toast.error("This subject is already assigned for that class"); return;
    }
    setRolesSaving(true);
    const { error } = await supabase.from("instructor_subjects").insert({
      instructor_id: rolesInstructor!.user_id,
      subject_id:    addSubjectId,
      class_id:      addSubjectClassId,
      school_id:     schoolId!,
    });
    if (error) { toast.error(error.message); }
    else {
      toast.success("Subject assigned");
      setAddSubjectClassId("");
      setAddSubjectId("");
      await openRoles(rolesInstructor!); // refresh
    }
    setRolesSaving(false);
    fetchData(); // refresh badge counts in table
  };

  // ── Remove a subject assignment ─────────────────────────────────
  const handleRemoveSubjectAssignment = async (id: string) => {
    setRolesSaving(true);
    const { error } = await supabase.from("instructor_subjects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); await openRoles(rolesInstructor!); }
    setRolesSaving(false);
    fetchData();
  };

  // ── Toggle class instructor assignment ──────────────────────────
  const handleToggleClassInstructor = async (classId: string, checked: boolean) => {
    setRolesSaving(true);
    if (checked) {
      const { error } = await supabase.from("class_instructors").insert({
        instructor_id: rolesInstructor!.user_id,
        class_id:      classId,
        school_id:     schoolId!,
      });
      if (error) toast.error(error.message);
      else toast.success("Class instructor assigned");
    } else {
      const { error } = await supabase.from("class_instructors").delete()
        .eq("instructor_id", rolesInstructor!.user_id)
        .eq("class_id", classId);
      if (error) toast.error(error.message);
      else toast.success("Removed from class");
    }
    // Refresh the dialog list without closing
    const { data } = await supabase
      .from("class_instructors")
      .select("id, class_id, classes:class_id(name)")
      .eq("instructor_id", rolesInstructor!.user_id)
      .eq("school_id", schoolId!);
    setClassInstructorAssignments(
      (data || []).map((r: any) => ({ id: r.id, class_id: r.class_id, class_name: r.classes?.name ?? "" }))
    );
    setRolesSaving(false);
    fetchData();
  };

  // ── Create / update instructor ──────────────────────────────────
  const handleSave = async () => {
    if (!fullName.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    if (!editing && !password) { toast.error("Password is required for new instructor"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("profiles").update({
          full_name:  fullName,
          first_name: fullName.split(" ")[0] || "",
          last_name:  fullName.split(" ").slice(1).join(" ") || "",
          email:      email.trim().toLowerCase(),
        } as any).eq("user_id", editing.user_id);
        if (error) throw error;
        toast.success("Instructor updated");
      } else {
        const { data: newUserId, error: createError } = await supabase.rpc("create_school_user", {
          _email: email.trim().toLowerCase(), _password: password,
          _full_name: fullName, _role: "instructor",
          _school_id: schoolId!, _username: null,
        } as any);
        if (createError) throw new Error(createError.message);
        if (!newUserId) throw new Error("Failed to create instructor account.");
        await supabase.from("instructor_permissions").upsert({
          instructor_id: newUserId, school_id: schoolId!,
          can_manage_exams: false, can_view_results: false, can_manage_students: false,
          can_manage_subjects: false, can_mark_attendance: false, can_manage_grades: false,
          can_manage_timetable: false, can_manage_fees: false, can_post_announcements: false,
        } as any, { onConflict: "instructor_id" });
        sendInstructorWelcomeEmail({ to: email, instructorName: fullName, schoolName: document.title || "School", loginUrl: window.location.origin, password }).catch(() => {});
        toast.success("Instructor created");
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  // ── Delete instructor ───────────────────────────────────────────
  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this instructor? This cannot be undone.")) return;
    try {
      await Promise.all([
        supabase.from("instructor_permissions").delete().eq("instructor_id", userId),
        supabase.from("instructor_classes").delete().eq("instructor_id", userId),
        supabase.from("instructor_subjects").delete().eq("instructor_id", userId),
        supabase.from("class_instructors").delete().eq("instructor_id", userId),
      ]);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("user_id", userId);
      toast.success("Instructor deleted");
      fetchData();
    } catch (err: any) { toast.error(err.message); }
  };

  // ── Save legacy permissions ─────────────────────────────────────
  const handleSavePerms = async () => {
    if (!permsInstructor || !schoolId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("instructor_permissions").upsert({
        instructor_id: permsInstructor.user_id, school_id: schoolId,
        ...perms, updated_at: new Date().toISOString(),
      } as any, { onConflict: "instructor_id" });
      if (error) throw error;
      toast.success("Permissions updated");
      setPermsOpen(false);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  // ── Save legacy class assignments ───────────────────────────────
  const handleSaveClasses = async () => {
    if (!classesInstructor || !schoolId) return;
    setSaving(true);
    try {
      await supabase.from("instructor_classes").delete().eq("instructor_id", classesInstructor.user_id);
      if (selectedClasses.length > 0) {
        await supabase.from("instructor_classes").insert(
          selectedClasses.map(classId => ({ instructor_id: classesInstructor.user_id, class_id: classId, school_id: schoolId }))
        );
      }
      toast.success("Classes assigned");
      setClassesOpen(false);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const openNew    = () => { setEditing(null); setFullName(""); setEmail(""); setPassword(""); setDialogOpen(true); };
  const openEdit   = (i: Instructor) => { setEditing(i); setFullName(i.full_name); setEmail(i.email); setPassword(""); setDialogOpen(true); };
  const openPerms  = (i: Instructor) => { setPermsInstructor(i); setPerms(i.permissions || { can_manage_exams: false, can_view_results: false, can_manage_students: false, can_manage_subjects: false, can_mark_attendance: false, can_manage_grades: false, can_manage_timetable: false, can_manage_fees: false, can_post_announcements: false }); setPermsOpen(true); };
  const openClasses = (i: Instructor) => { setClassesInstructor(i); setSelectedClasses(i.assigned_classes || []); setClassesOpen(true); };

  const getClassNames = (ids: string[]) => ids.map(id => classes.find(c => c.id === id)?.name).filter(Boolean).join(", ") || "None";

  const assignedClassIds = classInstructorAssignments.map(a => a.class_id);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Instructors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use <strong>Assign Roles</strong> to set each instructor as a Subject Instructor or Class Instructor.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Instructor</Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Subject Roles</TableHead>
                <TableHead>Class Roles</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No instructors yet</TableCell></TableRow>
              ) : instructors.map((i) => (
                <TableRow key={i.user_id}>
                  <TableCell className="font-medium">{i.full_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{i.email}</TableCell>

                  {/* Subject Instructor summary */}
                  <TableCell>
                    {i.subject_count > 0
                      ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-0">{i.subject_count} subject{i.subject_count > 1 ? "s" : ""}</Badge>
                      : <span className="text-muted-foreground text-xs">None</span>
                    }
                  </TableCell>

                  {/* Class Instructor summary */}
                  <TableCell>
                    {i.class_instructor_count > 0
                      ? <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-0">{i.class_instructor_count} class{i.class_instructor_count > 1 ? "es" : ""}</Badge>
                      : <span className="text-muted-foreground text-xs">None</span>
                    }
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* PRIMARY: Assign Roles (new system) */}
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => openRoles(i)}
                        title="Assign as Subject Instructor or Class Instructor"
                      >
                        <BookUser className="h-3.5 w-3.5" />
                        Assign Roles
                      </Button>
                      {/* Legacy actions */}
                      <Button variant="ghost" size="icon" title="Legacy class assign" onClick={() => openClasses(i)}><School className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Legacy permissions" onClick={() => openPerms(i)}><Shield className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(i.user_id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          ROLE ASSIGNMENTS DIALOG  ← THIS IS THE NEW MAIN FEATURE
          Two tabs:
            1. Subject Instructor — assign instructor to subject + class
            2. Class Instructor   — assign instructor to manage a class
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookUser className="h-5 w-5" />
              Assign Roles — {rolesInstructor?.full_name}
            </DialogTitle>
            <DialogDescription>
              Assign this instructor as a <strong>Subject Instructor</strong> (teaches a specific subject in a class)
              or a <strong>Class Instructor</strong> (manages an entire class). An instructor can hold both roles.
            </DialogDescription>
          </DialogHeader>

          {rolesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <Tabs defaultValue="subject" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="subject" className="flex-1 gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Subject Instructor
                  {subjectAssignments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">{subjectAssignments.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="class" className="flex-1 gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Class Instructor
                  {classInstructorAssignments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">{classInstructorAssignments.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── Tab 1: Subject Instructor ──────────────────────── */}
              <TabsContent value="subject" className="space-y-4 mt-4">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <strong>Subject Instructors</strong> can create exams, manage grades, upload questions,
                  and review submissions — but only for the subjects assigned below.
                </div>

                {/* Current subject assignments */}
                {subjectAssignments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Subject Assignments</p>
                    {subjectAssignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{a.subject_name}</p>
                          <p className="text-xs text-muted-foreground">in {a.class_name}</p>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleRemoveSubjectAssignment(a.id)}
                          disabled={rolesSaving}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {subjectAssignments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No subject assignments yet.</p>
                )}

                <Separator />

                {/* Add new subject assignment form */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Subject Assignment</p>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Step 1 — Select Class</Label>
                    <Select value={addSubjectClassId} onValueChange={v => setAddSubjectClassId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a class…" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Step 2 — Select Subject</Label>
                    <Select value={addSubjectId} onValueChange={setAddSubjectId} disabled={!addSubjectClassId}>
                      <SelectTrigger>
                        <SelectValue placeholder={addSubjectClassId ? "Choose a subject…" : "Select class first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {classSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="w-full gap-2" size="sm"
                    onClick={handleAddSubjectAssignment}
                    disabled={rolesSaving || !addSubjectClassId || !addSubjectId}
                  >
                    {rolesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Assign as Subject Instructor
                  </Button>
                </div>
              </TabsContent>

              {/* ── Tab 2: Class Instructor ────────────────────────── */}
              <TabsContent value="class" className="space-y-4 mt-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 text-xs text-blue-800 dark:text-blue-300">
                  <strong>Class Instructors</strong> can manage attendance, send class notifications,
                  monitor students, and view overall class performance.
                  A class can have multiple class instructors.
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Check the classes this instructor should manage
                  </p>

                  {classes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No classes created yet.</p>
                  )}

                  {classes.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={assignedClassIds.includes(c.id)}
                        onCheckedChange={(checked) => handleToggleClassInstructor(c.id, !!checked)}
                        disabled={rolesSaving}
                      />
                      <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1">{c.name}</span>
                      {assignedClassIds.includes(c.id) && (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-0 text-xs">Class Instructor</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Instructor Dialog ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Instructor" : "Add Instructor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="instructor@school.com" /></div>
            <div className="space-y-2"><Label>Password {editing && "(leave blank to keep)"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} /></div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update" : "Create Instructor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Legacy Permissions Dialog ───────────────────────────────── */}
      <Dialog open={permsOpen} onOpenChange={setPermsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legacy Permissions — {permsInstructor?.full_name}</DialogTitle>
            <DialogDescription>These flat on/off switches still work. For subject-specific or class-specific access, use <strong>Assign Roles</strong> instead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {[
              { key: "can_manage_exams" as const, label: "Create & manage exams" },
              { key: "can_view_results" as const, label: "View student results" },
              { key: "can_manage_students" as const, label: "Manage students" },
              { key: "can_manage_subjects" as const, label: "Manage subjects" },
              { key: "can_mark_attendance" as const, label: "Mark attendance" },
              { key: "can_manage_grades" as const, label: "Manage grades" },
              { key: "can_manage_timetable" as const, label: "Manage timetable" },
              { key: "can_manage_fees" as const, label: "Manage fees" },
              { key: "can_post_announcements" as const, label: "Post announcements" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label>{label}</Label>
                <Switch checked={!!perms[key]} onCheckedChange={(v) => setPerms(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
            <Button onClick={handleSavePerms} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Legacy Assign Classes Dialog ────────────────────────────── */}
      <Dialog open={classesOpen} onOpenChange={setClassesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Legacy Class Assign — {classesInstructor?.full_name}</DialogTitle>
            <DialogDescription>This is the old class assignment system. Use <strong>Assign Roles → Class Instructor</strong> for the new approach.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2 max-h-[300px] overflow-auto">
            {classes.map(c => (
              <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedClasses.includes(c.id)}
                  onCheckedChange={(checked) => setSelectedClasses(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
            {classes.length === 0 && <p className="text-muted-foreground text-sm">No classes created yet.</p>}
          </div>
          <Button onClick={handleSaveClasses} className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Classes
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
