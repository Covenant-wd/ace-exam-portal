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
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Child { student_id: string; full_name: string; }
interface Parent {
  user_id: string;
  full_name: string;
  email: string;
  username: string | null;
  children: Child[];
}
interface StudentItem { user_id: string; full_name: string; }

export default function Parents() {
  const { schoolId } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Parent | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // Get parent user_ids for this school
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "parent")
        .eq("school_id", schoolId);

      const parentIds = (roles || []).map((r: any) => r.user_id);

      // Get student list
      const { data: studentRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student")
        .eq("school_id", schoolId);

      const studentIds = (studentRoles || []).map((r: any) => r.user_id);
      if (studentIds.length > 0) {
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", studentIds)
          .order("full_name");
        setStudents((studentProfiles || []) as StudentItem[]);
      }

      if (parentIds.length === 0) {
        setParents([]);
        setLoading(false);
        return;
      }

      // Get parent profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", parentIds)
        .order("full_name");

      // Get parent-student links
      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id, student_id")
        .in("parent_id", parentIds);

      // Get student names for the links
      const linkedStudentIds = [...new Set((links || []).map((l: any) => l.student_id))];
      let studentNameMap: Record<string, string> = {};
      if (linkedStudentIds.length > 0) {
        const { data: sProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", linkedStudentIds);
        (sProfiles || []).forEach((p: any) => { studentNameMap[p.user_id] = p.full_name; });
      }

      const parentList: Parent[] = (profiles || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: "",
        username: p.username,
        children: (links || [])
          .filter((l: any) => l.parent_id === p.user_id)
          .map((l: any) => ({ student_id: l.student_id, full_name: studentNameMap[l.student_id] || "Unknown" })),
      }));

      setParents(parentList);
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { if (schoolId) fetchData(); }, [schoolId]);

  const openNew = () => {
    setEditing(null);
    setFullName(""); setEmail(""); setUsername(""); setPassword("");
    setSelectedChildren([]);
    setDialogOpen(true);
  };

  const openEdit = (p: Parent) => {
    setEditing(p);
    setFullName(p.full_name); setEmail(p.email);
    setUsername(p.username || ""); setPassword("");
    setSelectedChildren(p.children.map(c => c.student_id));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fullName.trim() || !email.trim()) { toast.error("Name and email are required"); return; }
    if (!editing && !password) { toast.error("Password is required"); return; }
    if (!editing && !username.trim()) { toast.error("Username is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        // Update profile
        await supabase.from("profiles").update({
          full_name: fullName,
          first_name: fullName.split(" ")[0] || "",
          last_name: fullName.split(" ").slice(1).join(" ") || "",
          username: username || null,
        }).eq("user_id", editing.user_id);

        // Update children links
        await supabase.from("parent_students").delete().eq("parent_id", editing.user_id);
        if (selectedChildren.length > 0) {
          await supabase.from("parent_students").insert(
            selectedChildren.map(sid => ({ parent_id: editing.user_id, student_id: sid, school_id: schoolId! }))
          );
        }
        toast.success("Parent updated");
      } else {
        // Create parent via SQL function (no edge function needed)
        const { data: newUserId, error: createError } = await supabase.rpc("create_parent_account", {
          _email: email,
          _password: password,
          _full_name: fullName,
          _username: username,
          _school_id: schoolId!,
        });

        if (createError) {
          toast.error(createError.message || "Failed to create parent.");
          setSaving(false);
          return;
        }

        // Link children
        if (newUserId && selectedChildren.length > 0) {
          await supabase.from("parent_students").insert(
            selectedChildren.map(sid => ({ parent_id: newUserId, student_id: sid, school_id: schoolId! }))
          );
        }
        toast.success("Parent created");
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this parent? This cannot be undone.")) return;
    try {
      // Delete links first
      await supabase.from("parent_students").delete().eq("parent_id", userId);
      // Delete role
      await supabase.from("user_roles").delete().eq("user_id", userId);
      // Delete profile
      await supabase.from("profiles").delete().eq("user_id", userId);
      toast.success("Parent deleted");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleChild = (id: string) => {
    setSelectedChildren(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Parents</h1>
          <p className="text-muted-foreground">{parents.length} parent{parents.length !== 1 ? "s" : ""} registered</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Parent</Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Children</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />No parents yet
                  </TableCell>
                </TableRow>
              ) : parents.map((p) => (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.username || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.children.length === 0 ? (
                        <span className="text-muted-foreground text-xs">No children assigned</span>
                      ) : p.children.map(c => (
                        <Badge key={c.student_id} variant="secondary" className="text-xs">{c.full_name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.user_id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Parent" : "Add Parent"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Full Name *</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Parent full name" /></div>
            {!editing && <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" /></div>}
            <div className="space-y-2"><Label>Username *</Label><Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username for login" /></div>
            {!editing && <div className="space-y-2"><Label>Password *</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} /></div>}

            <div className="space-y-2">
              <Label>Assign Children ({selectedChildren.length} selected)</Label>
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students registered yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                  {students.map(s => (
                    <label key={s.user_id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted text-sm">
                      <Checkbox checked={selectedChildren.includes(s.user_id)} onCheckedChange={() => toggleChild(s.user_id)} />
                      <span>{s.full_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Update" : "Create"} Parent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
