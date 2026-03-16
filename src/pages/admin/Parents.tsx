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
  const { session, schoolId } = useAuth();
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

  const callFn = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-parent", {
      body,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [parentsData, studentsRes] = await Promise.all([
        callFn({ action: "list" }),
        supabase.from("user_roles").select("user_id").eq("role", "student").eq("school_id", schoolId),
      ]);
      setParents(parentsData.parents || []);

      if (studentsRes.data && studentsRes.data.length > 0) {
        const userIds = studentsRes.data.map((r: any) => r.user_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds).order("full_name");
        setStudents((profiles || []) as StudentItem[]);
      }
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
    if (!editing && !password) { toast.error("Password is required for new parent"); return; }
    if (!editing && !username.trim()) { toast.error("Username is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await callFn({
          action: "update",
          user_id: editing.user_id,
          full_name: fullName,
          email,
          username,
          child_ids: selectedChildren,
          ...(password ? { password } : {}),
        });
        toast.success("Parent updated");
      } else {
        await callFn({
          action: "create",
          full_name: fullName,
          email,
          username,
          password,
          child_ids: selectedChildren,
        });
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
    if (!confirm("Delete this parent?")) return;
    try {
      await callFn({ action: "delete", user_id: userId });
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
                <TableHead>Email</TableHead>
                <TableHead>Children</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />No parents yet
                  </TableCell>
                </TableRow>
              ) : parents.map((p) => (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.username || "—"}</TableCell>
                  <TableCell>{p.email}</TableCell>
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
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" /></div>
            <div className="space-y-2"><Label>Username *</Label><Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username for login" /></div>
            <div className="space-y-2"><Label>{editing ? "Password (leave blank to keep)" : "Password *"}</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} /></div>

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
