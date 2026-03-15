import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, Users, BarChart3, Calendar, Loader2 } from "lucide-react";

export default function InstructorDashboard() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<any>(null);
  const [stats, setStats] = useState({ classes: 0, exams: 0, students: 0 });
  const [activeSession, setActiveSession] = useState("");
  const [activeTerm, setActiveTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Fetch permissions
      const { data: perms } = await supabase.from("instructor_permissions").select("*").eq("instructor_id", user.id).single();
      setPermissions(perms);

      // Fetch assigned classes
      const { data: assignedClasses } = await supabase.from("instructor_classes").select("class_id").eq("instructor_id", user.id);
      const classCount = assignedClasses?.length || 0;
      setStats(s => ({ ...s, classes: classCount }));

      // Active session & term
      const { data: sess } = await supabase.from("sessions").select("name").eq("is_active", true).single();
      if (sess) setActiveSession(sess.name);
      const { data: term } = await supabase.from("terms").select("name").eq("is_active", true).single();
      if (term) setActiveTerm(term.name);

      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const cards = [
    { label: "Assigned Classes", value: stats.classes, icon: BookOpen, color: "text-primary" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Instructor Dashboard</h1>

      {(activeSession || activeTerm) && (
        <Card className="mb-6 border-0 shadow-md bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <Calendar className="h-5 w-5 text-primary" />
            {activeSession && <Badge variant="outline">{activeSession}</Badge>}
            {activeTerm && <Badge>{activeTerm}</Badge>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {cards.map(c => (
          <Card key={c.label} className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle>Your Permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {permissions?.can_manage_exams && <Badge>Create & Manage Exams</Badge>}
            {permissions?.can_view_results && <Badge>View Results</Badge>}
            {permissions?.can_manage_students && <Badge>Manage Students</Badge>}
            {permissions?.can_manage_subjects && <Badge>Manage Subjects</Badge>}
            {permissions?.can_mark_attendance && <Badge>Mark Attendance</Badge>}
            {permissions?.can_manage_grades && <Badge>Manage Grades</Badge>}
            {permissions?.can_manage_timetable && <Badge>Manage Timetable</Badge>}
            {permissions?.can_manage_fees && <Badge>Manage Fees</Badge>}
            {permissions?.can_post_announcements && <Badge>Post Announcements</Badge>}
            {!permissions?.can_manage_exams && !permissions?.can_view_results && !permissions?.can_manage_students && !permissions?.can_manage_subjects && !permissions?.can_mark_attendance && !permissions?.can_manage_grades && !permissions?.can_manage_timetable && !permissions?.can_manage_fees && !permissions?.can_post_announcements && (
              <p className="text-muted-foreground text-sm">No permissions assigned yet. Contact your administrator.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
