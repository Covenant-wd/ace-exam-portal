// src/components/DashboardLayout.tsx
import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useInstructorPermissions } from "@/hooks/useInstructorPermissions";
import {
  GraduationCap, LayoutDashboard, BookOpen, Users, BarChart3,
  LogOut, Menu, X, ClipboardList, Settings, Calendar, UserCheck,
  CheckSquare, Clock, Award, DollarSign, Megaphone, Heart, ChevronRight, AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { cn, getFullName, isPlaceholderEmail } from "@/lib/utils";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import SubscriptionGuard from "@/components/SubscriptionGuard";
import { useSchoolCbtLink } from "@/hooks/useSchoolSettings";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/admin/sessions", label: "Sessions", icon: Calendar, group: "Academic" },
  { to: "/admin/classes", label: "Classes", icon: GraduationCap, group: "Academic" },
  { to: "/admin/subjects", label: "Subjects", icon: BookOpen, group: "Academic" },
  { to: "/admin/timetable", label: "Timetable", icon: Clock, group: "Academic" },
  { to: "/admin/students", label: "Students", icon: Users, group: "People" },
  { to: "/admin/instructors", label: "Instructors", icon: UserCheck, group: "People" },
  { to: "/admin/parents", label: "Parents", icon: Heart, group: "People" },
  { to: "/admin/results", label: "Results", icon: BarChart3, group: "Assessment" },
  { to: "/admin/grades", label: "Grades", icon: Award, group: "Assessment" },
  { to: "/admin/report-cards", label: "Report Cards", icon: ClipboardList, group: "Assessment" },
  { to: "/admin/attendance", label: "Attendance", icon: CheckSquare, group: "Records" },
  { to: "/admin/fees", label: "Fees", icon: DollarSign, group: "Records" },
  { to: "/admin/debtors", label: "Defaulters", icon: AlertTriangle, group: "Records" },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone, group: "Records" },
  { to: "/admin/settings", label: "Settings", icon: Settings, group: "System" },
];

const studentLinks = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { to: "/student/results", label: "My Results", icon: BarChart3, group: "" },
];

const parentLinks = [
  { to: "/parent", label: "Dashboard", icon: LayoutDashboard, group: "" },
];

interface NavItem { to: string; label: string; icon: any; group?: string; }

const roleColors: Record<string, string> = {
  admin: "from-violet-600 to-blue-600",
  instructor: "from-blue-600 to-cyan-600",
  student: "from-emerald-600 to-teal-600",
  parent: "from-pink-600 to-rose-600",
};

const roleBadgeColors: Record<string, string> = {
  admin: "bg-violet-500/20 text-violet-300",
  instructor: "bg-blue-500/20 text-blue-300",
  student: "bg-emerald-500/20 text-emerald-300",
  parent: "bg-pink-500/20 text-pink-300",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { role, signOut, user, schoolId, schoolSlug } = useAuth();
  const { schoolName } = useSchoolName();
  const { logoUrl } = useSchoolLogo();
  const { cbtLink } = useSchoolCbtLink();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    permissions: instrPerms,
    isSubjectInstructor,
    isClassInstructor,
  } = useInstructorPermissions();

  const instructorLinks: NavItem[] = (() => {
    if (role !== "instructor") return [];
    const links: NavItem[] = [{ to: "/instructor", label: "Dashboard", icon: LayoutDashboard, group: "Overview" }];

    const hasSubjectAccess = isSubjectInstructor || instrPerms?.can_manage_subjects || instrPerms?.can_manage_exams || instrPerms?.can_manage_grades;
    if (hasSubjectAccess) {
      links.push({ to: "/instructor/subjects", label: "Subjects",  icon: BookOpen,  group: "Academic"   });
      links.push({ to: "/instructor/grades",   label: "Grades",    icon: Award,     group: "Assessment" });
      links.push({ to: "/instructor/results",  label: "Results",   icon: BarChart3, group: "Assessment" });
    }

    const hasClassAccess = isClassInstructor || instrPerms?.can_mark_attendance || instrPerms?.can_post_announcements || instrPerms?.can_manage_students;
    if (hasClassAccess) {
      links.push({ to: "/instructor/attendance",    label: "Attendance",    icon: CheckSquare, group: "Records" });
      links.push({ to: "/instructor/announcements", label: "Announcements", icon: Megaphone,   group: "Records" });
      links.push({ to: "/instructor/students",      label: "Students",      icon: Users,       group: "People"  });
    }

    if (instrPerms?.can_manage_timetable) links.push({ to: "/instructor/timetable", label: "Timetable", icon: Clock,      group: "Academic" });
    if (instrPerms?.can_view_results && !hasSubjectAccess) links.push({ to: "/instructor/results", label: "Results", icon: BarChart3, group: "Assessment" });
    if (instrPerms?.can_manage_fees) links.push({ to: "/instructor/fees", label: "Fees", icon: DollarSign, group: "Records" });

    const seen = new Set<string>();
    return links.filter(l => { if (seen.has(l.to)) return false; seen.add(l.to); return true; });
  })();

  const links = role === "admin" ? adminLinks : role === "instructor" ? instructorLinks : role === "parent" ? parentLinks : studentLinks;

  const handleSignOut = async () => {
    const redirectTo = schoolSlug ? `/school/${schoolSlug}` : "/";
    await signOut();
    navigate(redirectTo);
  };

  const grouped = links.reduce((acc, link) => {
    const g = link.group || "";
    if (!acc[g]) acc[g] = [];
    acc[g].push(link);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const gradientClass = roleColors[role || ""] || "from-violet-600 to-blue-600";
  const badgeClass = roleBadgeColors[role || ""] || "bg-violet-500/20 text-violet-300";

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0f0f14]">

      {/* Mobile overlay — only mounted when open to avoid persistent compositing layer on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — on mobile, only mounted when open (prevents idle fixed layer that
          caused black-noise artifacts on Android Chrome). Desktop sidebar is always mounted. */}
      <aside className={cn(
        "z-50 flex w-64 flex-col",
        "lg:static lg:flex lg:h-full lg:shrink-0 lg:translate-x-0",
        "bg-[#13131a] text-white",
        sidebarOpen
          ? "fixed inset-y-0 left-0 translate-x-0 transition-transform duration-300"
          : "hidden lg:flex"
      )}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5 min-h-[65px]">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg overflow-hidden",
            gradientClass
          )}>
            {logoUrl ? (
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <GraduationCap className="h-4 w-4 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm leading-tight truncate text-white" title={schoolName}>
              {schoolName}
            </h1>
            <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize mt-0.5", badgeClass)}>
              {role} panel
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden shrink-0 text-white/40 hover:text-white transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
          {Object.entries(grouped).map(([group, groupLinks]) => (
            <div key={group}>
              {group && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {groupLinks.map((link) => {
                  const active = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all group",
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <link.icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-white" : "text-white/40 group-hover:text-white/70")} />
                      <span className="truncate">{link.label}</span>
                      {active && <ChevronRight className="ml-auto h-3 w-3 text-white/40 shrink-0" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* External CBT Portal button — shown if school has configured a CBT link */}
          {cbtLink && (
            <div className="pt-2 border-t border-white/5">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                External
              </p>
              <a
                href={cbtLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all group"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-white/40 group-hover:text-white/70 transition-colors" />
                <span className="truncate">{schoolName || "Academia HQ"}</span>
              </a>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-1">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white", gradientClass)}>
              {(getFullName(user) || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 font-medium truncate">{getFullName(user) || "My Account"}</p>
              {user?.email && !isPlaceholderEmail(user.email) && (
                <p className="text-[11px] text-white/50 truncate">{user.email}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="shrink-0 z-30 flex items-center gap-3 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#13131a] px-4 py-3 lg:px-6">
          <button
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {links.find(l => l.to === location.pathname)?.label || "Dashboard"}
            </p>
          </div>

          {/* External CBT launch button in header (visible on mobile when sidebar is closed) */}
          {cbtLink && (
            <a
              href={cbtLink}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
              {schoolName || "Academia HQ"}
            </a>
          )}

          <span className={cn("hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize shrink-0", badgeClass)}>
            {role}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
          <SubscriptionGuard>
            <SubscriptionBanner />
            {children}
          </SubscriptionGuard>
        </main>
      </div>
    </div>
  );
}
