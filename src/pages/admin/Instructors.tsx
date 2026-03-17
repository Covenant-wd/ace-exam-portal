import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Shield, School } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { sendInstructorWelcomeEmail } from "@/lib/email";

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
}

interface ClassItem {
  id: string;
  name: string;
}

export default function Instructors() {
  const { session, schoolId } = useAuth();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Permissions dialog
  const [permsOpen, setPermsOpen] = useState(false);
  const [permsInstructor, setPermsInstructor] = useState<Instructor | null>(null);
  const [perms, setPerms] = useState({ can_manage_exams: false, can_view_results: false, can_manage_students: false, can_manage_subjects: false, can_mark_attendance: false, can_manage_grades: false, can_manage_timetable: false, can_manage_fees: false, can_post_announcements: false });

  // Classes dialog
  const [classesOpen, setClassesOpen] = useState(false);
  const [classesInstructor, setClassesInstructor] = useState<Instructor | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const callFn = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-instructor", {
      body,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const fetchData = async () => {
    try {
      const [instrData, classData] = await Promise.all([
        callFn({ action: "list" }),
        supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
      ]);
      const rawInstructors = instrData.instructors || [];
      // Fetch permissions directly from DB to avoid edge function cache issues
      const userIds = rawInstructors.map((i: any) => i.user_id);
      if (userIds.length > 0) {
        const { data: permsData } = await supabase
          .from("instructor_permissions")
          .select("*")
          .in("instructor_id", userIds);
        const permsMap = new Map((permsData || []).map((p: any) => [p.instructor_id, p]));
        const merged = rawInstructors.map((i: any) => ({
          ...i,
          permissions: permsMap.get(i.user_id) || i.permissions,
        }));
        setInstructors(merged);
      } else {
        setInstructors(rawInstructors);
      }
      setClasses(classData.data || []);
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!fullName.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    if (!editing && !password) { toast.error("Password is required for new instructor"); return; }
    setSaving(true);
    try {
      if (editing) {
        await callFn({ action: "update", user_id: editing.user_id, email, full_name: fullName, ...(password ? { password } : {}) });
        toast.success("Instructor updated");
      } else {
        const res = await callFn({ action: "create", email, password, full_name: fullName });
        toast.success("Instructor created");
        // Send welcome email
        const loginUrl = window.location.origin + "/school/" + window.location.pathname.split("/")[2];
        await sendInstructorWelcomeEmail({
          to: email,
          instructorName: fullName,
          schoolName: document.title || "School",
          loginUrl: window.location.origin,
          password,
        });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this instructor?")) return;
    try {
      await callFn({ action: "delete", user_id: userId });
      toast.success("Instructor deleted");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSavePerms = async () => {
    if (!permsInstructor) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("instructor_permissions").upsert({
        instructor_id: permsInstructor.user_id,
        school_id: schoolId,
        can_manage_exams: perms.can_manage_exams,
        can_view_results: perms.can_view_results,
        can_manage_students: perms.can_manage_students,
        can_manage_subjects: perms.can_manage_subjects,
        can_mark_attendance: perms.can_mark_attendance,
        can_manage_grades: perms.can_manage_grades,
        can_manage_timetable: perms.can_manage_timetable,
        can_manage_fees: perms.can_manage_fees,
        can_post_announcements: perms.can_post_announcements,
        updated_at: new Date().toISOString(),
      }, { onConflict: "instructor_id" });
      if (error) throw error;
      toast.success("Permissions updated");
      setPermsOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleSaveClasses = async () => {
    if (!classesInstructor) return;
    setSaving(true);
    try {
      await callFn({ action: "assign_classes", instructor_id: classesInstructor.user_id, class_ids: selectedClasses });
      toast.success("Classes assigned");
      setClassesOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const openNew = () => { setEditing(null); setFullName(""); setEmail(""); setPassword(""); setDialogOpen(true); };
  const openEdit = (i: Instructor) => { setEditing(i); setFullName(i.full_name); setEmail(i.email); setPassword(""); setDialogOpen(true); };
  const openPerms = (i: Instructor) => {
    setPermsInstructor(i);
    setPerms(i.permissions || { can_manage_exams: false, can_view_results: false, can_manage_students: false, can_manage_subjects: false, can_mark_attendance: false, can_manage_grades: false, can_manage_timetable: false, can_manage_fees: false, can_post_announcements: false });
    setPermsOpen(true);
  };
  const openClasses = (i: Instructor) => {
    setClassesInstructor(i);
    setSelectedClasses(i.assigned_classes || []);
    setClassesOpen(true);
  };

  const getClassNames = (ids: string[]) => ids.map(id => classes.find(c => c.id === id)?.name).filter(Boolean).join(", ") || "None";

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Instructors</h1>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Instructor</Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No instructors yet</TableCell></TableRow>
              ) : instructors.map((i) => (
                <TableRow key={i.user_id}>
                  <TableCell className="font-medium">{i.full_name}</TableCell>
                  <TableCell>{i.email}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{getClassNames(i.assigned_classes)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {i.permissions?.can_manage_exams && <Badge variant="secondary" className="text-xs">Exams</Badge>}
                      {i.permissions?.can_view_results && <Badge variant="secondary" className="text-xs">Results</Badge>}
                      {i.permissions?.can_manage_students && <Badge variant="secondary" className="text-xs">Students</Badge>}
                      {i.permissions?.can_manage_subjects && <Badge variant="secondary" className="text-xs">Subjects</Badge>}
                      {i.permissions?.can_mark_attendance && <Badge variant="secondary" className="text-xs">Attendance</Badge>}
                      {i.permissions?.can_manage_grades && <Badge variant="secondary" className="text-xs">Grades</Badge>}
                      {i.permissions?.can_manage_timetable && <Badge variant="secondary" className="text-xs">Timetable</Badge>}
                      {i.permissions?.can_manage_fees && <Badge variant="secondary" className="text-xs">Fees</Badge>}
                      {i.permissions?.can_post_announcements && <Badge variant="secondary" className="text-xs">Announcements</Badge>}
                      {!i.permissions?.can_manage_exams && !i.permissions?.can_view_results && !i.permissions?.can_manage_students && !i.permissions?.can_manage_subjects && !i.permissions?.can_mark_attendance && !i.permissions?.can_manage_grades && !i.permissions?.can_manage_timetable && !i.permissions?.can_manage_fees && !i.permissions?.can_post_announcements && <span className="text-muted-foreground text-xs">None</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Assign Classes" onClick={() => openClasses(i)}><School className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Permissions" onClick={() => openPerms(i)}><Shield className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(i.user_id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Instructor" : "Add Instructor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="instructor@school.com" /></div>
            <div className="space-y-2"><Label>Password {editing && "(leave blank to keep)"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} /></div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permsOpen} onOpenChange={setPermsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Permissions — {permsInstructor?.full_name}</DialogTitle></DialogHeader>
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
                <Switch checked={perms[key]} onCheckedChange={(v) => setPerms(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
            <Button onClick={handleSavePerms} className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Classes Dialog */}
      <Dialog open={classesOpen} onOpenChange={setClassesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Classes — {classesInstructor?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2 max-h-[300px] overflow-auto">
            {classes.map(c => (
              <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedClasses.includes(c.id)}
                  onCheckedChange={(checked) => {
                    setSelectedClasses(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                  }}
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
