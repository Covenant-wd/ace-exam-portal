import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  GraduationCap, LayoutDashboard, BookOpen, FileText, Users, BarChart3,
  LogOut, Menu, X, ClipboardList, Settings, Calendar, UserCheck,
  CheckSquare, Clock, Award, DollarSign, Megaphone, Heart, ChevronRight, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { SubscriptionBanner, SuspendedScreen } from "@/components/SubscriptionComponents";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/admin/sessions", label: "Sessions", icon: Calendar, group: "Academic" },
  { to: "/admin/classes", label: "Classes", icon: GraduationCap, group: "Academic" },
  { to: "/admin/subjects", label: "Subjects", icon: BookOpen, group: "Academic" },
  { to: "/admin/timetable", label: "Timetable", icon: Clock, group: "Academic" },
  { to: "/admin/students", label: "Students", icon: Users, group: "People" },
  { to: "/admin/instructors", label: "Instructors", icon: UserCheck, group: "People" },
  { to: "/admin/parents", label: "Parents", icon: Heart, group: "People" },
  { to: "/admin/exams", label: "Exams", icon: FileText, group: "Assessment" },
  { to: "/admin/questions", label: "Questions", icon: ClipboardList, group: "Assessment" },
  { to: "/admin/results", label: "Results", icon: BarChart3, group: "Assessment" },
  { to: "/admin/grades", label: "Grades", icon: Award, group: "Assessment" },
  { to: "/admin/attendance", label: "Attendance", icon: CheckSquare, group: "Records" },
  { to: "/admin/fees", label: "Fees", icon: DollarSign, group: "Records" },
  { to: "/admin/debtors", label: "Debtors", icon: AlertTriangle, group: "Records" },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone, group: "Records" },
  { to: "/admin/settings", label: "Settings", icon: Settings, group: "System" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role, schoolId, signOut } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const schoolName = useSchoolName();
  const schoolLogo = useSchoolLogo();

  // ── Subscription check ──────────────────────────────────────
  const { info: subInfo, loading: subLoading } = useSubscription(schoolId);
  // ────────────────────────────────────────────────────────────

  const [instructorLinks, setInstructorLinks] = useState<typeof adminLinks>([]);

  useEffect(() => {
    if (role !== "instructor" || !user) return;
    supabase
      .from("instructor_permissions")
      .select("*")
      .eq("instructor_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const links: typeof adminLinks = [
          { to: "/instructor", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
        ];
        if (data.can_manage_exams)       links.push({ to: "/instructor/exams",       label: "Exams",       icon: FileText,      group: "Assessment" });
        if (data.can_view_results)        links.push({ to: "/instructor/results",     label: "Results",     icon: BarChart3,     group: "Assessment" });
        if (data.can_manage_grades)       links.push({ to: "/instructor/grades",      label: "Grades",      icon: Award,         group: "Assessment" });
        if (data.can_manage_students)     links.push({ to: "/instructor/students",    label: "Students",    icon: Users,         group: "People" });
        if (data.can_mark_attendance)     links.push({ to: "/instructor/attendance",  label: "Attendance",  icon: CheckSquare,   group: "Records" });
        if (data.can_manage_fees)         links.push({ to: "/instructor/fees",        label: "Fees",        icon: DollarSign,    group: "Records" });
        if (data.can_manage_timetable)    links.push({ to: "/instructor/timetable",   label: "Timetable",   icon: Clock,         group: "Academic" });
        if (data.can_manage_subjects)     links.push({ to: "/instructor/subjects",    label: "Subjects",    icon: BookOpen,      group: "Academic" });
        if (data.can_post_announcements)  links.push({ to: "/instructor/announcements", label: "Announcements", icon: Megaphone, group: "Records" });
        setInstructorLinks(links);
      });
  }, [role, user]);

  const links = role === "instructor" ? instructorLinks : adminLinks;

  // Group links
  const groups = links.reduce<Record<string, typeof adminLinks>>((acc, link) => {
    if (!acc[link.group]) acc[link.group] = [];
    acc[link.group].push(link);
    return acc;
  }, {});

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // ── Suspended: show full-page block, nothing else ────────────
  if (!subLoading && subInfo?.isSuspended) {
    return (
      <div className="flex min-h-screen bg-background">
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between border-b bg-card px-4 py-3 lg:px-6">
            <div className="flex items-center gap-2">
              {schoolLogo ? (
                <img src={schoolLogo} alt="" className="h-7 w-7 rounded object-contain" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <GraduationCap className="h-4 w-4 text-primary" />
                </div>
              )}
              <span className="font-semibold text-sm">{schoolName}</span>
            </div>
            <button onClick={handleSignOut} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </header>
          <main className="flex-1 p-6">
            <SuspendedScreen />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          {schoolLogo ? (
            <img src={schoolLogo} alt="" className="h-9 w-9 rounded-lg object-contain bg-white" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/20">
              <GraduationCap className="h-5 w-5 text-sidebar-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-tight truncate">{schoolName || "Academia HQ"}</h1>
            <p className="text-xs opacity-60 capitalize">{role?.replace("_", " ")}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {Object.entries(groups).map(([group, groupLinks]) => (
            <div key={group}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider opacity-40">{group}</p>
              <div className="space-y-0.5">
                {groupLinks.map((link) => {
                  const active = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <link.icon className="h-4 w-4 shrink-0" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <p className="mb-2 truncate px-1 text-xs opacity-50">{user?.email}</p>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center gap-4 border-b bg-card px-4 py-3 lg:px-6">
          <button
            className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {/* Subscription status banner — shown for grace and restricted */}
          {subInfo && <div className="mb-4"><SubscriptionBanner info={subInfo} /></div>}
          {children}
        </main>
      </div>
    </div>
  );
}
