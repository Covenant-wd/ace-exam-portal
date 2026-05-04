import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import {
  BookOpen, FileText, Users, BarChart3, Calendar, Loader2,
  CheckSquare, Award, DollarSign, Megaphone, ChevronRight,
  GraduationCap, BookMarked, ClipboardList,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useInstructorRoles } from "@/hooks/useInstructorRoles";

const permLabels: Record<string, { label: string; icon: any; to: string; color: string }> = {
  can_manage_exams:       { label: "Manage Exams",     icon: FileText,    to: "/instructor/exams",        color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  can_view_results:       { label: "View Results",     icon: BarChart3,   to: "/instructor/results",      color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
  can_manage_students:    { label: "Manage Students",  icon: Users,       to: "/instructor/students",     color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  can_manage_subjects:    { label: "Manage Subjects",  icon: BookOpen,    to: "/instructor/subjects",     color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  can_mark_attendance:    { label: "Mark Attendance",  icon: CheckSquare, to: "/instructor/attendance",   color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400" },
  can_manage_grades:      { label: "Manage Grades",    icon: Award,       to: "/instructor/grades",       color: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" },
  can_manage_timetable:   { label: "Timetable",        icon: Calendar,    to: "/instructor/timetable",    color: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" },
  can_manage_fees:        { label: "Manage Fees",      icon: DollarSign,  to: "/instructor/fees",         color: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400" },
  can_post_announcements: { label: "Announcements",    icon: Megaphone,   to: "/instructor/announcements",color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
};

export default function InstructorDashboard() {
  const { user, schoolId } = useAuth();
  const [permissions, setPermissions] = useState<any>(null);
  const [legacyClasses, setLegacyClasses] = useState<{ id: string; name: string }[]>([]);
  const [activeSession, setActiveSession] = useState("");
  const [activeTerm, setActiveTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const {
    subjectAssignments,
    classAssignments,
    isSubjectInstructor,
    isClassInstructor,
    loading: rolesLoading,
  } = useInstructorRoles();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [permsRes, classesRes] = await Promise.all([
        supabase.from("instructor_permissions").select("*").eq("instructor_id", user.id).single(),
        supabase.from("instructor_classes").select("class_id, classes:class_id(id, name)").eq("instructor_id", user.id),
      ]);
      setPermissions(permsRes.data);
      setLegacyClasses((classesRes.data || []).map((c: any) => c.classes).filter(Boolean));

      if (schoolId) {
        const [sess, term] = await Promise.all([
          supabase.from("sessions").select("name").eq("school_id", schoolId).eq("is_active", true).single(),
          supabase.from("terms").select("name").eq("school_id", schoolId).eq("is_active", true).single(),
        ]);
        if (sess.data) setActiveSession(sess.data.name);
        if (term.data) setActiveTerm(term.data.name);
      }
      setLoading(false);
    };
    load();
  }, [user, schoolId]);

  const activePerms = permissions ? Object.entries(permLabels).filter(([key]) => permissions[key]) : [];

  if (loading || rolesLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const subjectCount = subjectAssignments.length;
  const classCount = classAssignments.length || legacyClasses.length;

  return (
    <div className="space-y-6">

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-6 text-white shadow-lg">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "25px 25px" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Instructor Dashboard</h1>
            <p className="text-white/70 text-sm mt-1">
              {subjectCount > 0 && `${subjectCount} subject${subjectCount > 1 ? "s" : ""}`}
              {subjectCount > 0 && classCount > 0 && " · "}
              {classCount > 0 && `${classCount} class${classCount > 1 ? "es" : ""}`}
              {subjectCount === 0 && classCount === 0 && "No assignments yet"}
            </p>
          </div>
          {(activeSession || activeTerm) && (
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 backdrop-blur-sm border border-white/10">
              <Calendar className="h-4 w-4 text-white/60 shrink-0" />
              <div>
                {activeSession && <p className="text-xs font-semibold text-white">{activeSession}</p>}
                {activeTerm && <p className="text-xs text-white/60">{activeTerm}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subject Instructor section */}
      {isSubjectInstructor && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookMarked className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-bold text-foreground">My Subjects</h2>
            <Badge variant="secondary" className="text-xs">Subject Instructor</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {subjectAssignments.map((a) => (
              <div key={a.id} className="flex items-start gap-3 bg-white dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5 shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                  <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{a.subject_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.class_name}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Exams",     icon: FileText,      to: "/instructor/exams",    color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
              { label: "Grades",    icon: Award,         to: "/instructor/grades",   color: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" },
              { label: "Questions", icon: ClipboardList, to: "/instructor/questions",color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
              { label: "Results",   icon: BarChart3,     to: "/instructor/results",  color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.to} className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-3 border border-black/5 dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color.split(" ").slice(0, 2).join(" ")}`}>
                    <Icon className={`h-4 w-4 ${item.color.split(" ").slice(2).join(" ")}`} />
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Class Instructor section */}
      {isClassInstructor && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            <h2 className="text-base font-bold text-foreground">My Classes</h2>
            <Badge variant="secondary" className="text-xs">Class Instructor</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            {classAssignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5 shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                  <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{a.class_name}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Attendance",    icon: CheckSquare, to: "/instructor/attendance",    color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400" },
              { label: "Announcements", icon: Megaphone,   to: "/instructor/announcements", color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
              { label: "Students",      icon: Users,       to: "/instructor/students",      color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
              { label: "Performance",   icon: BarChart3,   to: "/instructor/results",       color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.to} className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-3 border border-black/5 dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color.split(" ").slice(0, 2).join(" ")}`}>
                    <Icon className={`h-4 w-4 ${item.color.split(" ").slice(2).join(" ")}`} />
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Legacy assigned classes (backwards compat) */}
      {!isClassInstructor && legacyClasses.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">My Classes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {legacyClasses.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5 shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                  <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy permissions quick access */}
      {activePerms.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">Your Access</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activePerms.map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <Link key={key} to={cfg.to} className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition-all group">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.color.split(" ").slice(0, 2).join(" ")}`}>
                    <Icon className={`h-4 w-4 ${cfg.color.split(" ").slice(2).join(" ")}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{cfg.label}</p>
                    <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isSubjectInstructor && !isClassInstructor && activePerms.length === 0 && legacyClasses.length === 0 && (
        <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 p-8 text-center">
          <p className="text-muted-foreground text-sm">No assignments yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Contact your school admin to be assigned as a subject or class instructor.</p>
        </div>
      )}
    </div>
  );
}
