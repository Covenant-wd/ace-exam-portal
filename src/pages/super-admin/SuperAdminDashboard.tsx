import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { sendAdminWelcomeEmail } from "@/lib/email";
import { Loader2, Plus, School, Users, Copy, ExternalLink, Trash2, Edit } from "lucide-react";

interface SchoolItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolItem | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  // Admin assignment states
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignSchoolId, setAssignSchoolId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const fetchSchools = async () => {
    const { data } = await supabase.from("schools").select("*").order("created_at", { ascending: false });
    setSchools((data as SchoolItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchSchools(); }, []);

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!editing) setSlug(generateSlug(value));
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { toast.error("Name and slug are required"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("schools").update({ name, slug }).eq("id", editing.id);
        if (error) throw error;
        toast.success("School updated");
      } else {
        const { error } = await supabase.from("schools").insert({ name, slug });
        if (error) throw error;

        // Also create default school_settings entries
        const { data: newSchool } = await supabase.from("schools").select("id").eq("slug", slug).single();
        if (newSchool) {
          await supabase.from("school_settings").insert([
            { key: "school_name", value: name, school_id: newSchool.id },
            { key: "school_logo_url", value: "", school_id: newSchool.id },
          ]);
        }
        toast.success("School created");
      }
      setDialogOpen(false);
      setName(""); setSlug(""); setEditing(null);
      fetchSchools();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (school: SchoolItem) => {
    if (!confirm(`Delete "${school.name}"? This will remove all associated data.`)) return;
    const { error } = await supabase.from("schools").delete().eq("id", school.id);
    if (error) toast.error(error.message);
    else { toast.success("School deleted"); fetchSchools(); }
  };

  const openEdit = (school: SchoolItem) => {
    setEditing(school);
    setName(school.name);
    setSlug(school.slug);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setName(""); setSlug("");
    setDialogOpen(true);
  };

  const handleAssignAdmin = async () => {
    if (!adminEmail || !adminPassword || !adminName) {
      toast.error("All fields are required");
      return;
    }
    setAssignSaving(true);
    try {
      const { data: newUserId, error: createError } = await supabase.rpc("create_school_user", {
        _email:     adminEmail.trim().toLowerCase(),
        _password:  adminPassword,
        _full_name: adminName,
        _role:      "admin",
        _school_id: assignSchoolId,
        _username:  null,
      } as any);
      if (createError) throw new Error(createError.message);
      if (!newUserId) throw new Error("Failed to create admin account.");

      toast.success("School admin created successfully");
      // Fire-and-forget welcome email
      const school = schools.find(s => s.id === assignSchoolId);
      if (school) {
        const loginUrl = `${window.location.origin}/school/${school.slug}`;
        sendAdminWelcomeEmail({
          to: adminEmail,
          adminName: adminName,
          schoolName: school.name,
          loginUrl,
          password: adminPassword,
        }).catch(() => {});
      }
      setAssignDialog(false);
      setAdminEmail(""); setAdminPassword(""); setAdminName("");
    } catch (err: any) {
      toast.error(err.message);
    }
    setAssignSaving(false);
  };

  const copyLoginUrl = (schoolSlug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/school/${schoolSlug}`);
    toast.success("Login URL copied!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schools</h1>
          <p className="text-muted-foreground">Manage all schools on the platform</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add School
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <School className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{schools.length}</p>
              <p className="text-sm text-muted-foreground">Total Schools</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schools Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Login URL</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No schools yet. Create your first school to get started.
                  </TableCell>
                </TableRow>
              ) : (
                schools.map((school) => (
                  <TableRow key={school.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
                          {school.logo_url ? (
                            <img src={school.logo_url} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <School className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        {school.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{school.slug}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => copyLoginUrl(school.slug)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy URL
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(school.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setAssignSchoolId(school.id); setAssignDialog(true); }}>
                          <Users className="mr-1.5 h-3.5 w-3.5" /> Add Admin
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(school)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(school)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit School Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit School" : "Create School"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>School Name</Label>
              <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="ABC Academy" />
            </div>
            <div className="space-y-2">
              <Label>URL Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="abc-academy" />
              <p className="text-xs text-muted-foreground">Login URL: {window.location.origin}/school/{slug || "..."}</p>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Create School"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Admin Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign School Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Admin Name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@school.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" minLength={6} />
            </div>
            <Button onClick={handleAssignAdmin} disabled={assignSaving} className="w-full">
              {assignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Admin Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
