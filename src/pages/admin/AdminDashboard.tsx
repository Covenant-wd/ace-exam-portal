import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { Users, BookOpen, FileText, ClipboardList, UserCheck, Heart, TrendingUp, Calendar, ChevronRight, GraduationCap } from "lucide-react";

export default function AdminDashboard() {
  const { schoolId } = useAuth();
  const [stats, setStats] = useState({ students: 0, subjects: 0, exams: 0, attempts: 0, instructors: 0, parents: 0, classes: 0 });
  const [feeStats, setFeeStats] = useState({ total_expected: 0, total_collected: 0, total_outstanding: 0, non_payers: 0 });
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    const fetchStats = async () => {
      // All queries — including terms (for both name display AND fee totals termId)
      // — run in a single parallel batch. Previously terms ran sequentially after
      // Promise.all purely to get the termId, adding an extra round-trip (W7).
      const [students, subjects, exams, attempts, instructors, parents, classes, sess, termRes] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "student").eq("school_id", schoolId),
        supabase.from("subjects").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("exam_attempts").select("id, exams!inner(school_id)", { count: "exact", head: true }).eq("is_submitted", true).eq("exams.school_id", schoolId),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "instructor").eq("school_id", schoolId),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "parent").eq("school_id", schoolId),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("sessions").select("name").eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
        supabase.from("terms").select("id, name").eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
      ]);
      setStats({
        students:    students.count    ?? 0,
        subjects:    subjects.count    ?? 0,
        exams:       exams.count       ?? 0,
        attempts:    attempts.count    ?? 0,
        instructors: instructors.count ?? 0,
        parents:     parents.count     ?? 0,
        classes:     classes.count     ?? 0,
      });
      if (sess.data?.name)    setActiveSession(sess.data.name);
      if (termRes.data?.name) setActiveTerm(termRes.data.name);

      // termId is already available from the parallel batch — no extra query needed
      const termId = (termRes.data as any)?.id ?? null;
      const feeRes = await supabase.rpc("get_school_fee_totals", {
        _school_id: schoolId,
        _term_id:   termId,
      } as any);
      if (feeRes.data && (feeRes.data as any[]).length > 0) {
        const f = (feeRes.data as any[])[0];
        setFeeStats({
          total_expected:    Number(f.total_expected)    || 0,
          total_collected:   Number(f.total_collected)   || 0,
          total_outstanding: Number(f.total_outstanding) || 0,
          non_payers:        Number(f.non_payers)        || 0,
        });
      }
      setLoading(false);
    };
    fetchStats();
  }, [schoolId]);

  const primaryStats = [
    { label: "Students", value: stats.students, icon: Users, color: "bg-blue-500", light: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", to: "/admin/students" },
    { label: "Instructors", value: stats.instructors, icon: UserCheck, color: "bg-violet-500", light: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", to: "/admin/instructors" },
    { label: "Parents", value: stats.parents, icon: Heart, color: "bg-pink-500", light: "bg-pink-50 dark:bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", to: "/admin/parents" },
    { label: "Classes", value: stats.classes, icon: GraduationCap, color: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", to: "/admin/classes" },
    { label: "Subjects", value: stats.subjects, icon: BookOpen, color: "bg-amber-500", light: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", to: "/admin/subjects" },
    { label: "Exams", value: stats.exams, icon: FileText, color: "bg-cyan-500", light: "bg-cyan-50 dark:bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", to: "/admin/exams" },
    { label: "Submissions", value: stats.attempts, icon: ClipboardList, color: "bg-orange-500", light: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", to: "/admin/results" },
    { label: "Growth", value: `${stats.students > 0 ? "+" + stats.students : "0"}`, icon: TrendingUp, color: "bg-teal-500", light: "bg-teal-50 dark:bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", to: "/admin/students" },
  ];

  const feeCards = [
    {
      label: "Expected",
      value: feeStats.total_expected >= 1000
        ? `₦${(feeStats.total_expected / 1000).toFixed(0)}k`
        : `₦${feeStats.total_expected.toLocaleString()}`,
      sub: "Total fees this term",
      colorClass: "from-blue-600 to-cyan-600",
    },
    {
      label: "Collected",
      value: feeStats.total_collected >= 1000
        ? `₦${(feeStats.total_collected / 1000).toFixed(0)}k`
        : `₦${feeStats.total_collected.toLocaleString()}`,
      sub: "Payments received",
      colorClass: "from-emerald-600 to-teal-600",
    },
    {
      label: "Outstanding",
      value: feeStats.total_outstanding >= 1000
        ? `₦${(feeStats.total_outstanding / 1000).toFixed(0)}k`
        : `₦${feeStats.total_outstanding.toLocaleString()}`,
      sub: `${feeStats.non_payers} students unpaid`,
      colorClass: "from-red-600 to-rose-600",
    },
  ];

  const quickLinks = [
    { label: "Add Student", to: "/admin/students", icon: Users, desc: "Enroll new students" },
    { label: "Create Exam", to: "/admin/exams", icon: FileText, desc: "Set up assessments" },
    { label: "Mark Attendance", to: "/admin/attendance", icon: ClipboardList, desc: "Daily attendance" },
    { label: "Record Payment", to: "/admin/fees", icon: ClipboardList, desc: "Fee management" },
    { label: "Post Announcement", to: "/admin/announcements", icon: ClipboardList, desc: "Broadcast messages" },
    { label: "View Results", to: "/admin/results", icon: TrendingUp, desc: "Exam performance" },
  ];

  return (
    <div className="space-y-6">

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-600 p-6 text-white shadow-lg">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Admin Dashboard</h1>
            <p className="text-white/70 text-sm mt-1">Manage your school from one place</p>
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {primaryStats.map((stat) => (
          <Link
            key={stat.label}
            to={stat.to}
            className="group relative bg-white dark:bg-white/5 rounded-2xl p-4 shadow-sm border border-black/5 dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.light}`}>
                <stat.icon className={`h-5 w-5 ${stat.text}`} />
              </div>
              <ChevronRight className="h-4 w-4 text-black/20 dark:text-white/20 group-hover:text-black/40 dark:group-hover:text-white/40 transition-colors" />
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              {loading ? <span className="inline-block h-7 w-10 rounded bg-black/5 dark:bg-white/5 animate-pulse" /> : stat.value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">{stat.label}</p>
          </Link>
        ))}
      </div>

      {/* Fee Financial Overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Financial Overview</h2>
          <a href="/admin/debtors" className="text-xs text-primary hover:underline">View debtors →</a>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {feeCards.map(card => (
            <div key={card.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.colorClass} p-4 text-white shadow-sm`}>
              <p className="text-xl font-extrabold leading-none">{loading ? "—" : card.value}</p>
              <p className="text-xs font-medium opacity-80 mt-1">{card.label}</p>
              <p className="text-xs opacity-60 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickLinks.map((ql) => (
            <Link
              key={ql.label}
              to={ql.to}
              className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-xl p-4 border border-black/5 dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10">
                <ql.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{ql.label}</p>
                <p className="text-xs text-muted-foreground truncate">{ql.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
