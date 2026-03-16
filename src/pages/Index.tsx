import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { Loader2, GraduationCap, BookOpen, Clock, BarChart3, Shield, Users, Zap, ArrowRight, CheckCircle2, Search, School, Bell, CalendarDays, DollarSign, ClipboardList, Award, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SchoolItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
}

const features = [
  { icon: ClipboardList, title: "CBT Examinations", description: "Create, publish and auto-grade timed computer-based exams with rich question types and instant results.", color: "from-violet-500 to-purple-600" },
  { icon: Users, title: "Student Management", description: "Enroll students, manage profiles, assign classes and track their academic journey all in one place.", color: "from-blue-500 to-cyan-600" },
  { icon: CalendarDays, title: "Timetable & Attendance", description: "Schedule classes, manage periods and track daily attendance with ease.", color: "from-emerald-500 to-teal-600" },
  { icon: Award, title: "Grades & Reports", description: "Record scores, compute weighted grades and generate detailed academic report cards.", color: "from-orange-500 to-amber-600" },
  { icon: DollarSign, title: "Fee Management", description: "Create fee types, record payments, track outstanding balances and generate receipts.", color: "from-pink-500 to-rose-600" },
  { icon: Bell, title: "Announcements", description: "Broadcast targeted announcements to students, staff or specific classes instantly.", color: "from-indigo-500 to-blue-600" },
  { icon: Shield, title: "Role-Based Access", description: "Super admins, school admins, instructors and students each get precisely scoped access.", color: "from-slate-500 to-gray-600" },
  { icon: BarChart3, title: "Analytics & Insights", description: "Track exam performance, attendance trends and fee collection with real-time dashboards.", color: "from-teal-500 to-cyan-600" },
  { icon: Zap, title: "Multi-School Platform", description: "Each school gets a branded portal with its own data, settings and login URL.", color: "from-yellow-500 to-orange-500" },
];

const steps = [
  { step: "01", title: "School Gets Onboarded", description: "Super admin creates a school, assigns an admin and generates a unique school login URL.", accent: "bg-violet-500" },
  { step: "02", title: "Admin Sets Everything Up", description: "Add sessions, classes, subjects, instructors and students. Configure fees, grades and timetable.", accent: "bg-blue-500" },
  { step: "03", title: "Teaching & Learning Begins", description: "Instructors manage their classes. Students access exams, view results, check timetables and fees.", accent: "bg-emerald-500" },
];

export default function Index() {
  const { user, role, loading } = useAuth();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(true);

  useEffect(() => {
    const fetchSchools = async () => {
      const { data } = await supabase.from("schools").select("id, name, slug, logo_url").order("name");
      setSchools((data as SchoolItem[]) || []);
      setLoadingSchools(false);
    };
    fetchSchools();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    if (role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "instructor") return <Navigate to="/instructor" replace />;
    return <Navigate to="/student" replace />;
  }

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/25">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Academia <span className="text-violet-400">HQ</span></span>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white hover:bg-white/5">
            <Link to="/super-admin/login">Platform Admin</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-20 md:pt-36 md:pb-28">
        {/* Background effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="absolute top-40 right-0 h-[400px] w-[400px] rounded-full bg-blue-600/8 blur-[100px]" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-emerald-600/8 blur-[100px]" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "60px 60px"}} />
        </div>

        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            Complete School Management System
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl leading-[1.05]"
          >
            Manage Your School{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                Smarter
              </span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-white/50 md:text-xl leading-relaxed"
          >
            Academia HQ is the all-in-one platform for modern schools — CBT exams, student management,
            attendance, grades, fees, timetable and more. All in one place.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <a href="#schools" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all hover:-translate-y-0.5">
              Find Your School <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#features" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 hover:bg-white/10 transition-all">
              Explore Features
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-2xl mx-auto"
          >
            {[
              { value: "9+", label: "Core Modules" },
              { value: "99.9%", label: "Uptime" },
              { value: "Multi", label: "School Support" },
              { value: "24/7", label: "Availability" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/5 bg-white/3 px-4 py-4 text-center backdrop-blur">
                <div className="text-2xl font-extrabold text-white">{stat.value}</div>
                <div className="mt-1 text-xs text-white/40">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* School Finder */}
      <section id="schools" className="py-20 border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Find Your School</h2>
            <p className="mt-3 text-white/40">Select your school to access the student or staff portal.</p>
          </motion.div>

          <div className="relative max-w-md mx-auto mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              placeholder="Search schools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-all"
            />
          </div>

          {loadingSchools ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : filteredSchools.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <School className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>{searchQuery ? "No schools match your search." : "No schools registered yet."}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSchools.map((school, i) => (
                <motion.div
                  key={school.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/school/${school.slug}`}
                    className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 p-4 transition-all hover:border-violet-500/30 hover:bg-violet-500/5 hover:-translate-y-0.5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 overflow-hidden">
                      {school.logo_url ? (
                        <img src={school.logo_url} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <School className="h-5 w-5 text-violet-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-white/90 truncate group-hover:text-violet-300 transition-colors">{school.name}</h3>
                      <p className="text-xs text-white/30 mt-0.5">Click to login</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-violet-400 transition-colors shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Everything Your School Needs</h2>
            <p className="mt-4 text-white/40 text-lg">
              From CBT exams to fee management — Academia HQ covers every aspect of school administration.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="group relative rounded-2xl border border-white/5 bg-white/[0.03] p-6 transition-all hover:border-white/10 hover:bg-white/[0.06]"
              >
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-white/90">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/40">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 border-t border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">How It Works</h2>
            <p className="mt-4 text-white/40 text-lg">Get your school up and running in minutes.</p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-white/10 to-transparent -translate-x-8 z-0" />
                )}
                <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${item.accent} text-white text-xl font-extrabold shadow-lg`}>
                  {item.step}
                </div>
                <h3 className="text-xl font-bold text-white/90">{item.title}</h3>
                <p className="mt-2 text-white/40 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-blue-600 to-emerald-600 p-12 text-center md:p-20"
          >
            <div className="absolute inset-0 opacity-10" style={{backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px"}} />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
                Ready to Transform Your School?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
                Join schools using Academia HQ for complete school management — from CBT exams to fee tracking.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                {["CBT Examinations", "Student Management", "Fee Tracking", "Grade Reports", "Attendance"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold">Academia <span className="text-violet-400">HQ</span></span>
            </div>
            <p className="text-sm text-white/30">
              Complete School Management System — CBT, Grades, Fees, Attendance & More
            </p>
            <p className="text-xs text-white/20">© {new Date().getFullYear()} Academia HQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
