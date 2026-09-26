import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendPlatformBroadcastEmail } from "@/lib/email";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Search, Pencil, Trash2, Users, Filter, Mail, Send, X } from "lucide-react";

interface SchoolUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  school_id: string;
  school_name: string;
  username: string | null;
  created_at: string;
}

interface SchoolItem {
  id: string;
  name: string;
}

const roleBadge: Record<string, string> = {
  admin:      "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  instructor: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  student:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  parent:     "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
};

export default function SuperAdminUsers() {
  const [users, setUsers]         = useState<SchoolUser[]>([]);
  const [schools, setSchools]     = useState<SchoolItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterSchool, setFilterSchool] = useState("all");
  const [filterRole, setFilterRole]     = useState("all");

  // Edit dialog
  const [editOpen, setEditOpen]   = useState(false);
  const [editing, setEditing]     = useState<SchoolUser | null>(null);
  const [editName, setEditName]   = useState("");
  const [editRole, setEditRole]   = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [saving, setSaving]       = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting]     = useState<SchoolUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [delSaving, setDelSaving]   = useState(false);

  // Broadcast mail
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mailOpen, setMailOpen]       = useState(false);
  const [mailMode, setMailMode]       = useState<"selected" | "all" | "single">("selected");
  const [mailSingleTarget, setMailSingleTarget] = useState<SchoolUser | null>(null);
  const [mailSubject, setMailSubject] = useState("");
  const [mailMessage, setMailMessage] = useState("");
  const [mailSending, setMailSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [usersRes, schoolsRes] = await Promise.all([
      supabase.rpc("get_all_school_users"),
      supabase.from("schools").select("id, name").order("name"),
    ]);
    if (usersRes.error) toast.error(usersRes.error.message);
    else setUsers((usersRes.data as SchoolUser[]) || []);
    setSchools((schoolsRes.data as SchoolItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase());
    const matchSchool = filterSchool === "all" || u.school_id === filterSchool;
    const matchRole   = filterRole === "all"   || u.role === filterRole;
    return matchSearch && matchSchool && matchRole;
  });

  // ── Broadcast mail helpers ───────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selectedIds.has(u.user_id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        // Deselect only the currently-filtered rows
        const next = new Set(prev);
        filtered.forEach(u => next.delete(u.user_id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach(u => next.add(u.user_id));
      return next;
    });
  };

  const toggleSelectOne = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const mailRecipients: SchoolUser[] = useMemo(() => {
    if (mailMode === "single") return mailSingleTarget ? [mailSingleTarget] : [];
    if (mailMode === "all") return users;
    return users.filter(u => selectedIds.has(u.user_id));
  }, [mailMode, mailSingleTarget, users, selectedIds]);

  const openMailForSelected = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one user first");
      return;
    }
    setMailMode("selected");
    setMailSingleTarget(null);
    setMailSubject("");
    setMailMessage("");
    setMailOpen(true);
  };

  const openMailForAll = () => {
    setMailMode("all");
    setMailSingleTarget(null);
    setMailSubject("");
    setMailMessage("");
    setMailOpen(true);
  };

  const openMailForOne = (u: SchoolUser) => {
    setMailMode("single");
    setMailSingleTarget(u);
    setMailSubject("");
    setMailMessage("");
    setMailOpen(true);
  };

  const handleSendMail = async () => {
    if (!mailSubject.trim() || !mailMessage.trim()) {
      toast.error("Please enter a subject and message");
      return;
    }
    const emails = Array.from(
      new Set(mailRecipients.map(u => u.email).filter(Boolean))
    );
    if (emails.length === 0) {
      toast.error("No recipients with a valid email address");
      return;
    }
    setMailSending(true);
    try {
      const ok = await sendPlatformBroadcastEmail({
        to: emails,
        subject: mailSubject.trim(),
        message: mailMessage.trim(),
        loginUrl: window.location.origin,
      });
      if (!ok) throw new Error("Failed to send email. Please try again.");
      toast.success(`Email sent to ${emails.length} user${emails.length === 1 ? "" : "s"}.`);
      setMailOpen(false);
      setMailSubject("");
      setMailMessage("");
      if (mailMode === "selected") setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setMailSending(false);
    }
  };

  const openEdit = (u: SchoolUser) => {
    setEditing(u);
    setEditName(u.full_name);
    setEditRole(u.role);
    setEditSchool(u.school_id);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editing || !editName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("update_school_user", {
      _user_id:   editing.user_id,
      _full_name: editName.trim(),
      _role:      editRole,
      _school_id: editSchool,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("User updated");
    setEditOpen(false);
    fetchData();
  };

  const openDelete = (u: SchoolUser) => {
    setDeleting(u);
    setDeleteConfirm("");
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    if (deleteConfirm !== deleting.email) {
      toast.error("Email does not match"); return;
    }
    setDelSaving(true);
    const { error } = await supabase.rpc("delete_school_user", {
      _user_id: deleting.user_id,
    } as any);
    setDelSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("User permanently deleted");
    setDeleteOpen(false);
    fetchData();
  };

  const counts = {
    total:      users.length,
    admin:      users.filter(u => u.role === "admin").length,
    instructor: users.filter(u => u.role === "instructor").length,
    student:    users.filter(u => u.role === "student").length,
    parent:     users.filter(u => u.role === "parent").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">All Users</h1>
          <p className="text-muted-foreground mt-1">View, edit and permanently delete users across all schools</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={openMailForSelected}
          >
            <Mail className="mr-2 h-4 w-4" />
            Email Selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </Button>
          <Button onClick={openMailForAll} disabled={users.length === 0}>
            <Send className="mr-2 h-4 w-4" />
            Email All Users
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total",       value: counts.total,       color: "bg-gray-100 dark:bg-white/5",           text: "text-gray-700 dark:text-white" },
          { label: "Admins",      value: counts.admin,       color: "bg-violet-50 dark:bg-violet-500/10",    text: "text-violet-700 dark:text-violet-300" },
          { label: "Instructors", value: counts.instructor,  color: "bg-blue-50 dark:bg-blue-500/10",        text: "text-blue-700 dark:text-blue-300" },
          { label: "Students",    value: counts.student,     color: "bg-emerald-50 dark:bg-emerald-500/10",  text: "text-emerald-700 dark:text-emerald-300" },
          { label: "Parents",     value: counts.parent,      color: "bg-pink-50 dark:bg-pink-500/10",        text: "text-pink-700 dark:text-pink-300" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <p className={`text-2xl font-extrabold ${s.text}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or username..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterSchool} onValueChange={setFilterSchool}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="instructor">Instructor</SelectItem>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="parent">Parent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleSelectAllFiltered}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      {search || filterSchool !== "all" || filterRole !== "all"
                        ? "No users match your filters"
                        : "No users found"}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((u, i) => (
                  <TableRow key={u.user_id} className={selectedIds.has(u.user_id) ? "bg-muted/40" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(u.user_id)}
                        onCheckedChange={() => toggleSelectOne(u.user_id)}
                        aria-label={`Select ${u.full_name || u.email}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.username || "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleBadge[u.role] || ""}`}>
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{u.school_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openMailForOne(u)} title="Send email">
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openDelete(u)} title="Delete permanently">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={editing?.email || ""} disabled className="opacity-50" />
              <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="instructor">Instructor</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>School</Label>
              <Select value={editSchool} onValueChange={setEditSchool}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schools.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleEdit} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently Delete User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 space-y-1">
              <p className="font-semibold text-sm">{deleting?.full_name}</p>
              <p className="text-xs text-muted-foreground">{deleting?.email}</p>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleBadge[deleting?.role || ""] || ""}`}>
                {deleting?.role}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              This will <strong>permanently delete</strong> this user and all their data including attendance, grades, results and payments. This action <strong>cannot be undone</strong>.
            </p>
            <div className="space-y-1.5">
              <Label>Type the user's email to confirm</Label>
              <Input
                placeholder={deleting?.email}
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={delSaving || deleteConfirm !== deleting?.email}
              >
                {delSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Broadcast / Targeted Mail Dialog */}
      <Dialog open={mailOpen} onOpenChange={(open) => { if (!mailSending) setMailOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {mailMode === "single" ? "Send Email" : mailMode === "all" ? "Broadcast to All Users" : "Email Selected Users"}
            </DialogTitle>
            <DialogDescription>
              {mailMode === "single" && mailSingleTarget && (
                <>Sending to <strong>{mailSingleTarget.full_name || mailSingleTarget.email}</strong> ({mailSingleTarget.email})</>
              )}
              {mailMode === "selected" && (
                <>Sending to <strong>{mailRecipients.length}</strong> selected user{mailRecipients.length === 1 ? "" : "s"}.</>
              )}
              {mailMode === "all" && (
                <>Sending to <strong>all {mailRecipients.length}</strong> users across every school on the platform.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {mailMode !== "single" && mailRecipients.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2 max-h-24 overflow-y-auto flex flex-wrap gap-1">
                {mailRecipients.slice(0, 30).map(u => (
                  <Badge key={u.user_id} variant="outline" className="text-xs font-normal">
                    {u.email}
                  </Badge>
                ))}
                {mailRecipients.length > 30 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    +{mailRecipients.length - 30} more
                  </Badge>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={mailSubject}
                onChange={e => setMailSubject(e.target.value)}
                placeholder="e.g. Scheduled maintenance this weekend"
                disabled={mailSending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                rows={6}
                value={mailMessage}
                onChange={e => setMailMessage(e.target.value)}
                placeholder="Write your message... (line breaks are preserved)"
                className="resize-none"
                disabled={mailSending}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setMailOpen(false)} disabled={mailSending}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSendMail} disabled={mailSending}>
                {mailSending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />Send</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
