import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import {
  Loader2, GraduationCap, BarChart3, Shield, Users, Zap,
  ArrowRight, Search, School, Bell, CalendarDays,
  DollarSign, ClipboardList, Award, ChevronRight, Sun, Moon, MessageCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import RequestDemoSection from "@/components/RequestDemoSection";

// ── Theme ────────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });
function useTheme() { return useContext(ThemeContext); }

interface SchoolItem { id: string; name: string; slug: string; logo_url: string; }

const spring = { type: "spring" as const, stiffness: 400, damping: 28 };



// ── Theme Toggle ────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }} transition={spring}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-all
        ${theme === "dark"
          ? "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-sm"}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "dark" ? (
          <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
            <Sun className="h-4 w-4" />
          </motion.span>
        ) : (
          <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
            <Moon className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </motion.button>
  );
}

// ── School Finder ───────────────────────────────────────────────────────────
function SchoolFinder() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [query, setQuery]             = useState("");
  const [suggestions, setSuggestions] = useState<SchoolItem[]>([]);
  const [searching, setSearching]     = useState(false);
  const [focused, setFocused]         = useState(false);
  const [selected, setSelected]       = useState<SchoolItem | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropRef     = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current  && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("schools")
        .select("id, name, slug, logo_url")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .limit(6);
      setSuggestions((data as SchoolItem[]) || []);
      setSearching(false);
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const showDrop = focused && query.trim().length > 0;

  return (
    <div className="mx-auto max-w-xl">
      <motion.div className="relative" animate={{ scale: focused ? 1.02 : 1 }} transition={spring}>
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${isDark ? "text-white/30" : "text-gray-400"}`} />
        {searching && (
          <motion.div className="absolute right-4 top-1/2 -translate-y-1/2" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="h-4 w-4 text-violet-400" />
          </motion.div>
        )}
        <motion.input
          ref={inputRef}
          type="text" autoComplete="off" spellCheck={false}
          placeholder="Type your school name…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); }}
          onFocus={() => setFocused(true)}
          onKeyDown={e => { if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); } }}
          className={`w-full rounded-2xl border pl-11 pr-11 py-4 text-sm focus:outline-none transition-all
            ${isDark ? "bg-white/5 text-white placeholder:text-white/30" : "bg-white text-gray-900 placeholder:text-gray-400 shadow-sm"}`}
          animate={{
            borderColor: focused ? "rgba(139,92,246,0.6)" : isDark ? "rgba(255,255,255,0.10)" : "rgba(209,213,219,1)",
            boxShadow:   focused ? "0 0 28px rgba(139,92,246,0.18)" : "none",
          }}
        />
      </motion.div>

      <AnimatePresence>
        {showDrop && (
          <motion.div
            ref={dropRef} key="dropdown"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ ...spring, duration: 0.18 }}
            className={`absolute z-50 mt-2 w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden
              ${isDark ? "border-white/10 bg-[#13131f] shadow-black/60" : "border-gray-200 bg-white shadow-gray-200/80"}`}
          >
            {suggestions.length === 0 && !searching ? (
              <div className={`flex flex-col items-center gap-2 py-8 ${isDark ? "text-white/30" : "text-gray-400"}`}>
                <School className="h-8 w-8 opacity-40" />
                <p className="text-sm">No schools found for "<span className={isDark ? "text-white/50" : "text-gray-600"}>{query}</span>"</p>
              </div>
            ) : (
              <ul className={`divide-y ${isDark ? "divide-white/5" : "divide-gray-100"}`}>
                {suggestions.map((school, i) => (
                  <motion.li key={school.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.04 }}>
                    <Link to={`/school/${school.slug}`} onClick={() => { setSelected(school); setQuery(school.name); setSuggestions([]); setFocused(false); }}
                      className={`group flex items-center gap-3 px-4 py-3.5 transition-colors ${isDark ? "hover:bg-violet-500/10" : "hover:bg-violet-50"}`}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 overflow-hidden">
                        {school.logo_url ? <img src={school.logo_url} alt="" className="h-full w-full object-contain" /> : <School className="h-4 w-4 text-violet-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isDark ? "text-white/90" : "text-gray-900"}`}>{school.name}</span>
                        <p className={`text-xs mt-0.5 ${isDark ? "text-white/30" : "text-gray-400"}`}>Click to access portal</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${isDark ? "text-white/20 group-hover:text-violet-400" : "text-gray-300 group-hover:text-violet-500"}`} />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-4">
          <Link to={`/school/${selected.slug}`}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 transition-colors group
              ${isDark ? "border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15" : "border-violet-200 bg-violet-50 hover:bg-violet-100"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 overflow-hidden">
                {selected.logo_url ? <img src={selected.logo_url} alt="" className="h-full w-full object-contain" /> : <School className="h-4 w-4 text-violet-400" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-gray-900"}`}>{selected.name}</p>
                <p className="text-xs text-violet-500">Tap to go to portal →</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-violet-400" />
          </Link>
        </motion.div>
      )}

      {!query && (
        <p className={`mt-3 text-center text-xs ${isDark ? "text-white/25" : "text-gray-400"}`}>
          Start typing your school name to see suggestions
        </p>
      )}
    </div>
  );
}

// ── Feature card data ───────────────────────────────────────────────────────
const features = [
  { icon: ClipboardList, title: "CBT Examinations",       desc: "Create, publish and auto-grade timed computer-based exams with instant results.",          color: "from-violet-500 to-purple-600" },
  { icon: Users,         title: "Student Management",     desc: "Enroll students, manage profiles, assign classes and track academic journeys.",             color: "from-blue-500 to-cyan-600"    },
  { icon: CalendarDays,  title: "Timetable & Attendance", desc: "Schedule classes, manage periods and track daily attendance with ease.",                    color: "from-emerald-500 to-teal-600" },
  { icon: Award,         title: "Grades & Reports",       desc: "Record scores, compute weighted grades and generate printable report cards.",               color: "from-orange-500 to-amber-600" },
  { icon: DollarSign,    title: "Fee Management",         desc: "Create fee types, record payments, track outstanding balances and generate receipts.",      color: "from-pink-500 to-rose-600"    },
  { icon: Bell,          title: "Announcements",          desc: "Broadcast targeted notices to students, staff or specific classes instantly.",               color: "from-indigo-500 to-blue-600"  },
  { icon: Shield,        title: "Role-Based Access",      desc: "Super admins, school admins, instructors and students each get precisely scoped access.",   color: "from-slate-500 to-gray-600"   },
  { icon: BarChart3,     title: "Analytics",              desc: "Track exam performance, attendance trends and fee collection with real-time dashboards.",   color: "from-teal-500 to-cyan-600"    },
  { icon: Zap,           title: "Multi-School SaaS",      desc: "Each school gets a branded portal with its own data, settings and login URL.",              color: "from-yellow-500 to-orange-500"},
];


// ── Main page ───────────────────────────────────────────────────────────────
function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, role, loading } = useAuth();
  const whatsappLink = "https://wa.me/2349039580317";

  if (loading) return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? "bg-[#0a0a0f]" : "bg-gray-50"}`}>
      <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
    </div>
  );

  if (user) {
    if (role === "super_admin")      return <Navigate to="/super-admin" replace />;
    if (role === "outreach_officer") return <Navigate to="/outreach"    replace />;
    if (role === "admin")            return <Navigate to="/admin"       replace />;
    if (role === "instructor")       return <Navigate to="/instructor"  replace />;
    if (role === "parent")           return <Navigate to="/parent"      replace />;
    if (role === "student")          return <Navigate to="/student"     replace />;
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>;
  }

  // ── Design tokens
  const bg        = isDark ? "bg-[#0a0a0f]"               : "bg-gray-50";
  const txt       = isDark ? "text-white"                  : "text-gray-900";
  const sub       = isDark ? "text-white/50"               : "text-gray-500";
  const muted     = isDark ? "text-white/40"               : "text-gray-400";
  const navBg     = isDark ? "bg-[#0a0a0f]/80 border-white/5" : "bg-white/90 border-gray-200";
  const cardBg    = isDark ? "bg-white/[0.03] border-white/5" : "bg-white border-gray-100 shadow-sm";
  const altSection = isDark ? "bg-white/[0.02]"            : "bg-white";

  return (
    <div className={`min-h-screen ${bg} ${txt} overflow-x-hidden transition-colors duration-300`}>

      {/* ── Nav ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${navBg}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }} transition={spring}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/25">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className={`text-lg font-bold tracking-tight ${txt}`}>
              Academia <span className="text-violet-400">HQ</span>
            </span>
          </motion.div>

          <div className="flex items-center gap-3">
            <Link
              to="/super-admin/login"
              className={`hidden md:inline-flex items-center text-xs font-medium transition-colors
                ${isDark ? "text-white/30 hover:text-white/60" : "text-gray-400 hover:text-gray-600"}`}
              tabIndex={-1} aria-hidden="true"
            >
              Manage Your School Smarter
            </Link>
            <ThemeToggle />
            <motion.a
              href={whatsappLink} target="_blank" rel="noopener noreferrer"
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={spring}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-green-500/20"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Contact Us</span>
            </motion.a>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative pt-20 pb-0 overflow-hidden">
        {/* Background orbs */}
        <div className="absolute inset-0 -z-10">
          {isDark ? (
            <>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
              <div className="absolute top-40 right-0 h-[350px] w-[350px] rounded-full bg-blue-600/8 blur-[100px]" />
            </>
          ) : (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-violet-400/8 blur-[120px]" />
          )}
        </div>

        <div className="mx-auto max-w-7xl px-6">
          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-4xl text-center text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-[1.05]"
          >
            Manage Your School{" "}
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Smarter
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className={`mx-auto mt-6 max-w-2xl text-center text-lg md:text-xl leading-relaxed ${sub}`}
          >
            CBT exams, student management, attendance, grades, fees, timetable — all in one place.
            Built for Nigerian schools, ready for yours.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <motion.a
              href="#schools" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={spring}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25"
            >
              Find Your School
              <ArrowRight className="h-4 w-4" />
            </motion.a>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={spring}>
              <Link
                to="/register"
                className={`inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-colors
                  ${isDark ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10" : "border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"}`}
              >
                <School className="h-4 w-4" />
                Register Your School
              </Link>
            </motion.div>
          </motion.div>

          {/* ── Hero photo — single Nigerian classroom image ── */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-16 overflow-hidden rounded-3xl shadow-2xl h-[420px] md:h-[500px]"
          >
            <img
              src="https://images.unsplash.com/photo-1604881991720-f91add269bed?w=1400&q=85"
              alt="Nigerian students in a classroom engaged in computer-based learning"
              className="h-full w-full object-cover object-center"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            {/* Floating stat pills on the photo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 1.1 }}
              className="absolute bottom-6 left-6 flex gap-3 flex-wrap"
            >
              {[
                { v: "9+",    l: "Modules"  },
                { v: "99.9%", l: "Uptime"   },
                { v: "24/7",  l: "Available"},
              ].map(s => (
                <div key={s.l} className="rounded-2xl border border-white/20 bg-black/40 px-4 py-2.5 backdrop-blur-xl">
                  <div className="text-lg font-extrabold text-white">{s.v}</div>
                  <div className="text-[10px] text-white/60">{s.l}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── School Finder ── */}
      <section id="schools" className={`pt-20 pb-20 border-y ${isDark ? "border-white/5" : "border-gray-100"}`}>
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Find Your School</h2>
            <p className={`mt-3 ${muted}`}>Type your school name to find and access your portal.</p>
          </motion.div>
          <div className="relative">
            <SchoolFinder />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-14"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Everything Your School Needs</h2>
            <p className={`mt-4 text-lg ${sub}`}>From CBT exams to fee management — all in one platform.</p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                className={`group relative rounded-2xl border p-6 cursor-default overflow-hidden ${cardBg}`}
              >
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${f.color}`}>
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className={`text-base font-bold ${txt}`}>{f.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={`py-24 border-t ${isDark ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-white"}`}>
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-14"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Up and Running in Minutes</h2>
            <p className={`mt-4 text-lg ${sub}`}>Three steps from sign-up to live school portal.</p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "School Gets Onboarded",      desc: "Super admin creates your school, assigns an admin and generates your unique school login URL.", color: "bg-violet-500"  },
              { step: "02", title: "Admin Sets Everything Up",   desc: "Add sessions, classes, subjects, instructors and students. Configure fees, grades and timetable.",  color: "bg-blue-500"    },
              { step: "03", title: "Teaching & Learning Begins", desc: "Instructors manage their classes. Students access exams, view results, timetables and fees.",       color: "bg-emerald-500" },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: i * 0.12 }}
                className="relative"
              >
                {i < 2 && (
                  <div className={`hidden md:block absolute top-7 left-full w-full h-px bg-gradient-to-r -translate-x-8 z-0
                    ${isDark ? "from-white/15 to-transparent" : "from-gray-300 to-transparent"}`} />
                )}
                <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${item.color} text-white text-xl font-extrabold shadow-lg`}>
                  {item.step}
                </div>
                <h3 className={`text-lg font-bold ${txt}`}>{item.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${sub}`}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Register CTA ── */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className={`relative overflow-hidden rounded-3xl border p-8 sm:p-12 text-center
              ${isDark
                ? "border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 via-[#0a0a0f] to-teal-900/10"
                : "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50"}`}
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <School className="h-7 w-7 text-white" />
            </div>
            <h2 className={`text-2xl font-extrabold sm:text-3xl mb-3 ${txt}`}>Is Your School Not Listed?</h2>
            <p className={`text-base max-w-lg mx-auto mb-8 ${sub}`}>
              Register your school on Academia HQ. Submit a quick application and our team will review it within 24–48 hours.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={spring}>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30"
                >
                  Register Your School
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <p className={`text-xs ${muted}`}>Free to apply · No credit card required</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Demo Request ── */}
      <RequestDemoSection />

      {/* ── Footer ── */}
      <footer className={`border-t py-10 ${isDark ? "border-white/5" : "border-gray-200"}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className={`text-sm font-bold ${txt}`}>Academia <span className="text-violet-400">HQ</span></span>
            </div>
            <p className={`text-sm ${isDark ? "text-white/30" : "text-gray-400"}`}>Complete School Management System — CBT, Grades, Fees, Attendance &amp; More</p>
            <p className={`text-xs ${isDark ? "text-white/20" : "text-gray-300"}`}>© {new Date().getFullYear()} Academia HQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function Index() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("academiahq-theme") as Theme) || "dark"; }
    catch { return "dark"; }
  });

  const toggle = () => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem("academiahq-theme", next); } catch {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <HomePage />
    </ThemeContext.Provider>
  );
}
