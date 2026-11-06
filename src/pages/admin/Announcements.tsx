import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendAnnouncementEmail, isNotificationEnabled } from "@/lib/email";
import { useSubscription } from "@/hooks/useSubscription";
import { useSchoolName } from "@/hooks/useSchoolSettings";
import { useInstructorPermissions } from "@/hooks/useInstructorPermissions";
import { useAssignedClasses } from "@/hooks/useAssignedClasses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Megaphone, Trash2, Edit, Lock } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_role: string;
  target_class_id: string | null;
  is_active: boolean;
  created_at: string;
}
interface ClassItem { id: string; name: string; }

// Radix UI Select v2 crashes when a <SelectItem> has value="".
// Use a sentinel string instead and convert it to null before saving to DB.
const ALL_CLASSES_SENTINEL = "__ALL__";

export default function Announcements() {
  const { user, schoolId, role } = useAuth();
  const { schoolName } = useSchoolName();
  const isInstructor = role === "instructor";
  const { permissions: instrPerms, loading: permLoading } = useInstructorPermissions();
  const { classes: assignedClasses, loading: assignedLoading } = useAssignedClasses();
  const { canWrite, isRestricted, isSuspended } = useSubscription();
  const [items, setItems] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRole, setTargetRole] = useState("all");
  const [targetClass, setTargetClass] = useState(ALL_CLASSES_SENTINEL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId || !user) return;
    if (isInstructor && assignedLoading) return;
    const init = async () => {
      if (isInstructor) {
        // Instructors only work with the classes assigned to them.
        setClasses(assignedClasses);
      } else {
        const { data: classData } = await supabase
          .from("classes")
          .select("id, name")
          .eq("school_id", schoolId)
          .order("name");
        setClasses((classData as ClassItem[]) || []);
      }
      await loadAnnouncements(schoolId);
      setLoading(false);
    };
    init();
  }, [schoolId, user, isInstructor, assignedLoading, assignedClasses]);

  const loadAnnouncements = async (sid: string) => {
    let query = supabase
      .from("announcements")
      .select("*")
      .eq("school_id", sid);
    // Instructors manage only the announcements they posted themselves.
    if (isInstructor && user) query = query.eq("created_by", user.id);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data as Announcement[]) || []);
  };

  const openNew = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setTargetRole(isInstructor ? "student" : "all");
    setTargetClass(isInstructor ? (assignedClasses[0]?.id ?? ALL_CLASSES_SENTINEL) : ALL_CLASSES_SENTINEL);
    setDialog(true);
  };

  const openEdit = (item: Announcement) => {
    setEditing(item);
    setTitle(item.title);
    setContent(item.content);
    setTargetRole(item.target_role);
    // null in DB → sentinel in Select; a UUID stays as-is
    setTargetClass(item.target_class_id ?? ALL_CLASSES_SENTINEL);
    setDialog(true);
  };

  const handleSave = async () => {
    if (!canWrite()) return;
    if (!title.trim()) {
      toast.error("Please enter a title for the announcement.");
      return;
    }
    if (!schoolId || !user) return;
    if (isInstructor) {
      if (!instrPerms?.can_post_announcements) {
        toast.error("You don't have permission to post announcements.");
        return;
      }
      if (targetClass === ALL_CLASSES_SENTINEL || !assignedClasses.some((c) => c.id === targetClass)) {
        toast.error("Please choose one of the classes assigned to you.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        target_role: targetRole,
        // sentinel → null (DB column is UUID, never store the sentinel string)
        target_class_id: targetClass !== ALL_CLASSES_SENTINEL ? targetClass : null,
        school_id: schoolId,
        created_by: user.id,
      };

      if (editing) {
        const { error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("announcements").insert(payload);
        if (error) throw error;

        // Send email notifications (non-fatal)
        try {
          const notifEnabled = await isNotificationEnabled(schoolId, "notify_announcement");
          if (!notifEnabled) throw new Error("skip");
          let userIds: string[] = [];
          if (isInstructor) {
            // Instructors only notify the students of their chosen class.
            const { data: stu } = await supabase.rpc("get_school_students_only", { _school_id: schoolId });
            userIds = ((stu as any[]) || [])
              .filter((s: any) => s.class_id === targetClass)
              .map((s: any) => s.user_id);
          } else {
            const targetRoles = targetRole === "all"
              ? ["student", "instructor", "parent"]
              : [targetRole];
            const { data: roleRows } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("role", targetRoles as any)
              .eq("school_id", schoolId);
            userIds = (roleRows || []).map((r: any) => r.user_id);
          }
          if (userIds.length > 0) {
            const { data: emailRows } = await supabase.rpc("get_user_emails_by_ids", {
              _user_ids: userIds,
            });
            const emails = (emailRows || []).map((r: any) => r.email).filter(Boolean);
            if (emails.length > 0) {
              await sendAnnouncementEmail({
                to: emails,
                schoolName: schoolName || document.title || "School",
                title: title.trim(),
                content: content.trim(),
                loginUrl: window.location.origin,
              });
            }
          }
        } catch {
          // Notification failure is non-fatal
        }
      }

      toast.success(editing ? "Announcement updated." : "Announcement published.");
      setDialog(false);
      await loadAnnouncements(schoolId);
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canWrite()) return;
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
    toast.success("Announcement deleted.");
  };

  const toggleActive = async (item: Announcement) => {
    if (!canWrite()) return;
    const { error } = await supabase
      .from("announcements")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, is_active: !a.is_active } : a))
    );
  };

  if (isInstructor && !permLoading && !assignedLoading && !instrPerms?.can_post_announcements) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Lock className="h-8 w-8 opacity-50" />
        <p className="font-medium">You don't have permission to post announcements.</p>
        <p className="text-sm">Ask your school admin to enable "Post announcements" for your account.</p>
      </CardContent></Card>
    );
  }

  if (isInstructor && !permLoading && !assignedLoading && assignedClasses.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Lock className="h-8 w-8 opacity-50" />
        <p className="font-medium">You haven't been assigned to a class yet.</p>
        <p className="text-sm">Ask your school admin to assign you as a class instructor.</p>
      </CardContent></Card>
    );
  }

  if (loading || (isInstructor && permLoading)) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">Publish announcements for students and staff</p>
        </div>
        <Button disabled={isRestricted || isSuspended} onClick={openNew}>
          {isRestricted || isSuspended
            ? <Lock className="mr-2 h-4 w-4" />
            : <Plus className="mr-2 h-4 w-4" />}
          New Announcement
        </Button>
      </div>

      {/* Announcement list */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>No announcements yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className={!item.is_active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline">
                      {item.target_role === "all" ? "Everyone" : item.target_role}
                    </Badge>
                    {item.target_class_id && (
                      <Badge variant="outline" className="text-xs">
                        {classes.find((c) => c.id === item.target_class_id)?.name ?? "Specific class"}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRestricted || isSuspended}
                    onClick={() => toggleActive(item)}
                  >
                    {item.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRestricted || isSuspended}
                    onClick={() => openEdit(item)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRestricted || isSuspended}
                    className="text-destructive"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title"
              />
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your announcement..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isInstructor ? "Everyone in the class" : "Everyone"}</SelectItem>
                  <SelectItem value="student">Students Only</SelectItem>
                  {!isInstructor && <SelectItem value="instructor">Instructors Only</SelectItem>}
                  {!isInstructor && <SelectItem value="admin">Admins Only</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {isInstructor ? "Class" : "Specific Class"}{" "}
                {!isInstructor && <span className="font-normal text-muted-foreground">(optional)</span>}
              </Label>
              {/*
                Radix UI Select v2 does not allow value="" on <SelectItem>.
                An empty string is treated as "no selection", identical to
                undefined/uncontrolled, which throws an internal assertion
                error that crashes the entire component and renders a blank page.
                Fix: use a non-empty sentinel value ("__ALL__") for "All classes"
                and convert it to null before writing to the DB.
              */}
              <Select value={targetClass} onValueChange={setTargetClass}>
                <SelectTrigger>
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  {!isInstructor && <SelectItem value={ALL_CLASSES_SENTINEL}>All Classes</SelectItem>}
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editing ? "Update" : "Publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
