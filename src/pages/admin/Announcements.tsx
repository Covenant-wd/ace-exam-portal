import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Megaphone, Trash2, Edit } from "lucide-react";

interface Announcement { id: string; title: string; content: string; target_role: string; target_class_id: string | null; is_active: boolean; created_at: string; }
interface ClassItem { id: string; name: string; }

export default function Announcements() {
  const { user, schoolId } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRole, setTargetRole] = useState("all");
  const [targetClass, setTargetClass] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const init = async () => {
      const { data: classData } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name");
      setClasses((classData as ClassItem[]) || []);
      await loadAnnouncements(schoolId);
      setLoading(false);
    };
    init();
  }, [schoolId]);

  const loadAnnouncements = async (sid: string) => {
    const { data } = await supabase.from("announcements").select("*").eq("school_id", sid).order("created_at", { ascending: false });
    setItems((data as Announcement[]) || []);
  };

  const handleSave = async () => {
    if (!title || !schoolId || !user) return;
    setSaving(true);
    try {
      const payload: any = {
        title, content, target_role: targetRole, target_class_id: targetClass || null,
        school_id: schoolId, created_by: user.id,
      };
      if (editing) {
        const { error } = await supabase.from("announcements").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("announcements").insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Updated" : "Published");
      setDialog(false);
      await loadAnnouncements(schoolId);
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    setItems(items.filter((a) => a.id !== id));
    toast.success("Deleted");
  };

  const toggleActive = async (item: Announcement) => {
    await supabase.from("announcements").update({ is_active: !item.is_active } as any).eq("id", item.id);
    setItems(items.map((a) => a.id === item.id ? { ...a, is_active: !a.is_active } : a));
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">Publish announcements for students and staff</p>
        </div>
        <Button onClick={() => { setEditing(null); setTitle(""); setContent(""); setTargetRole("all"); setTargetClass(""); setDialog(true); }}><Plus className="mr-2 h-4 w-4" /> New Announcement</Button>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Megaphone className="mx-auto mb-3 h-10 w-10 opacity-50" /><p>No announcements yet</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className={!item.is_active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? "Active" : "Inactive"}</Badge>
                    <Badge variant="outline">{item.target_role === "all" ? "Everyone" : item.target_role}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(item)}>{item.is_active ? "Deactivate" : "Activate"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setTitle(item.title); setContent(item.content); setTargetRole(item.target_role); setTargetClass(item.target_class_id || ""); setDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.content}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" /></div>
            <div className="space-y-2"><Label>Content</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your announcement..." rows={4} /></div>
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="student">Students Only</SelectItem>
                  <SelectItem value="instructor">Instructors Only</SelectItem>
                  <SelectItem value="admin">Admins Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Specific Class (optional)</Label>
              <Select value={targetClass} onValueChange={setTargetClass}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Classes</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Update" : "Publish"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
