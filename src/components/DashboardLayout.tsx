import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, LayoutDashboard, BookOpen, FileText, Users, BarChart3,
  LogOut, Menu, X, ClipboardList, Settings, Calendar, UserCheck,
  CheckSquare, Clock, Award, DollarSign, Megaphone, Heart
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import { supabase } from "@/integrations/supabase/client";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/sessions", label: "Sessions", icon: Calendar },
  { to: "/admin/classes", label: "Classes", icon: GraduationCap },
  { to: "/admin/students", label: "Students", icon: Users },
  { to: "/admin/instructors", label: "Instructors", icon: UserCheck },
  { to: "/admin/subjects", label: "Subjects", icon: BookOpen },
  { to: "/admin/exams", label: "Exams", icon: FileText },
  { to: "/admin/results", label: "Results", icon: BarChart3 },
  { to: "/admin/attendance", label: "Attendance", icon: CheckSquare },
  { to: "/admin/timetable", label: "Timetable", icon: Clock },
  { to: "/admin/grades", label: "Grades", icon: Award },
  { to: "/admin/fees", label: "Fees", icon: DollarSign },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/parents", label: "Parents", icon: Heart },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const studentLinks = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/exams", label: "Exams", icon: ClipboardList },
  { to: "/student/results", label: "My Results", icon: BarChart3 },
];

const parentLinks = [
  { to: "/parent", label: "Dashboard", icon: LayoutDashboard },
];

interface NavItem {
  to: string;
  label: string;
  icon: any;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { role, signOut, user } = useAuth();
  const { schoolName } = useSchoolName();
  const { logoUrl } = useSchoolLogo();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [instructorLinks, setInstructorLinks] = useState<NavItem[]>([]);

  useEffect(() => {
    if (role !== "instructor" || !user) return;
    const loadPerms = async () => {
      const { data } = await supabase.from("instructor_permissions").select("*").eq("instructor_id", user.id).single();
      const links: NavItem[] = [{ to: "/instructor", label: "Dashboard", icon: LayoutDashboard }];
      if (data?.can_manage_subjects) links.push({ to: "/instructor/subjects", label: "Subjects", icon: BookOpen });
      if (data?.can_manage_exams) links.push({ to: "/instructor/exams", label: "Exams", icon: FileText });
      if (data?.can_view_results) links.push({ to: "/instructor/results", label: "Results", icon: BarChart3 });
      if (data?.can_manage_students) links.push({ to: "/instructor/students", label: "Students", icon: Users });
      if (data?.can_mark_attendance) links.push({ to: "/instructor/attendance", label: "Attendance", icon: CheckSquare });
      if (data?.can_manage_grades) links.push({ to: "/instructor/grades", label: "Grades", icon: Award });
      if (data?.can_manage_timetable) links.push({ to: "/instructor/timetable", label: "Timetable", icon: Clock });
      if (data?.can_manage_fees) links.push({ to: "/instructor/fees", label: "Fees", icon: DollarSign });
      if (data?.can_post_announcements) links.push({ to: "/instructor/announcements", label: "Announcements", icon: Megaphone });
      setInstructorLinks(links);
    };
    loadPerms();
  }, [role, user]);

  const links = role === "admin" ? adminLinks : role === "instructor" ? instructorLinks : role === "parent" ? parentLinks : studentLinks;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <GraduationCap className="h-5 w-5" />
            )}
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight truncate">{schoolName}</h1>
            <p className="text-xs opacity-80 capitalize">{role} Panel</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <p className="mb-2 truncate text-xs opacity-70">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-4 border-b bg-card px-4 py-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
