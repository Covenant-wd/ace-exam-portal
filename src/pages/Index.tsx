import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import {
  Loader2, GraduationCap, BarChart3, Shield, Users, Zap,
  ArrowRight, Search, School, Bell, CalendarDays,
  DollarSign, ClipboardList, Award, ChevronRight, Sun, Moon, MessageCircle,
  CheckCircle, Star, TrendingUp, BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import RequestDemoSection from "@/components/RequestDemoSection";

// ── Theme ────────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
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
          : "border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-sm"}`}
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
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${isDark ? "text-white/30" : "text-blue-400"}`} />
        {searching && (
          <motion.div className="absolute right-4 top-1/2 -translate-y-1/2" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="h-4 w-4 text-blue-500" />
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
          className={`w-full rounded-2xl border pl-11 pr-11 py-4 text-sm focus:outline-none transition-all font-medium
            ${isDark ? "bg-white/5 text-white placeholder:text-white/30 border-white/10" : "bg-white text-gray-900 placeholder:text-gray-400 shadow-md border-blue-100"}`}
          animate={{
            borderColor: focused ? "rgba(37,99,235,0.5)" : isDark ? "rgba(255,255,255,0.10)" : "rgba(219,234,254,1)",
            boxShadow:   focused ? "0 0 0 4px rgba(37,99,235,0.08), 0 4px 20px rgba(37,99,235,0.12)" : isDark ? "none" : "0 2px 12px rgba(0,0,0,0.06)",
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
              ${isDark ? "border-white/10 bg-[#13131f] shadow-black/60" : "border-blue-100 bg-white shadow-blue-900/10"}`}
          >
            {suggestions.length === 0 && !searching ? (
              <div className={`flex flex-col items-center gap-2 py-8 ${isDark ? "text-white/30" : "text-gray-400"}`}>
                <School className="h-8 w-8 opacity-40" />
                <p className="text-sm">No schools found for "<span className={isDark ? "text-white/50" : "text-gray-600"}>{query}</span>"</p>
              </div>
            ) : (
              <ul className={`divide-y ${isDark ? "divide-white/5" : "divide-blue-50"}`}>
                {suggestions.map((school, i) => (
                  <motion.li key={school.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.04 }}>
                    <Link to={`/school/${school.slug}`} onClick={() => { setSelected(school); setQuery(school.name); setSuggestions([]); setFocused(false); }}
                      className={`group flex items-center gap-3 px-4 py-3.5 transition-colors ${isDark ? "hover:bg-blue-500/10" : "hover:bg-blue-50"}`}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 overflow-hidden">
                        {school.logo_url ? <img src={school.logo_url} alt="" className="h-full w-full object-contain" /> : <School className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isDark ? "text-white/90" : "text-gray-900"}`}>{school.name}</span>
                        <p className={`text-xs mt-0.5 ${isDark ? "text-white/30" : "text-gray-400"}`}>Click to access portal</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${isDark ? "text-white/20 group-hover:text-blue-400" : "text-gray-300 group-hover:text-blue-500"}`} />
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
              ${isDark ? "border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/15" : "border-blue-200 bg-blue-50 hover:bg-blue-100"}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 overflow-hidden">
                {selected.logo_url ? <img src={selected.logo_url} alt="" className="h-full w-full object-contain" /> : <School className="h-4 w-4 text-blue-500" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-gray-900"}`}>{selected.name}</p>
                <p className="text-xs text-blue-500">Tap to go to portal →</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-blue-500" />
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
  { icon: ClipboardList, title: "CBT Examinations",       desc: "Create, publish and auto-grade timed computer-based exams with instant results.",          color: "from-blue-500 to-blue-700",     bg: "bg-blue-50",   ring: "ring-blue-100" },
  { icon: Users,         title: "Student Management",     desc: "Enroll students, manage profiles, assign classes and track academic journeys.",             color: "from-indigo-500 to-indigo-700", bg: "bg-indigo-50", ring: "ring-indigo-100" },
  { icon: CalendarDays,  title: "Timetable & Attendance", desc: "Schedule classes, manage periods and track daily attendance with ease.",                    color: "from-sky-500 to-sky-700",       bg: "bg-sky-50",    ring: "ring-sky-100" },
  { icon: Award,         title: "Grades & Reports",       desc: "Record scores, compute weighted grades and generate printable report cards.",               color: "from-blue-600 to-cyan-600",     bg: "bg-cyan-50",   ring: "ring-cyan-100" },
  { icon: DollarSign,    title: "Fee Management",         desc: "Create fee types, record payments, track outstanding balances and generate receipts.",      color: "from-blue-500 to-blue-800",     bg: "bg-blue-50",   ring: "ring-blue-100" },
  { icon: Bell,          title: "Announcements",          desc: "Broadcast targeted notices to students, staff or specific classes instantly.",               color: "from-indigo-600 to-blue-600",   bg: "bg-indigo-50", ring: "ring-indigo-100" },
  { icon: Shield,        title: "Role-Based Access",      desc: "Super admins, school admins, instructors and students each get precisely scoped access.",   color: "from-slate-600 to-blue-700",    bg: "bg-slate-50",  ring: "ring-slate-100" },
  { icon: BarChart3,     title: "Analytics",              desc: "Track exam performance, attendance trends and fee collection with real-time dashboards.",   color: "from-blue-600 to-indigo-600",   bg: "bg-blue-50",   ring: "ring-blue-100" },
  { icon: Zap,           title: "Multi-School SaaS",      desc: "Each school gets a branded portal with its own data, settings and login URL.",              color: "from-blue-500 to-blue-700",     bg: "bg-blue-50",   ring: "ring-blue-100" },
];

// ── Main page ───────────────────────────────────────────────────────────────
function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, role, loading } = useAuth();
  const whatsappLink = "https://wa.me/2349039580317";

  if (loading) return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? "bg-[#0a0a0f]" : "bg-white"}`}>
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );

  if (user) {
    if (role === "super_admin")      return <Navigate to="/super-admin" replace />;
    if (role === "outreach_officer") return <Navigate to="/outreach"    replace />;
    if (role === "admin")            return <Navigate to="/admin"       replace />;
    if (role === "instructor")       return <Navigate to="/instructor"  replace />;
    if (role === "parent")           return <Navigate to="/parent"      replace />;
    if (role === "student")          return <Navigate to="/student"     replace />;
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  // ── Design tokens
  const bg        = isDark ? "bg-[#060914]"              : "bg-white";
  const txt       = isDark ? "text-white"                : "text-gray-900";
  const sub       = isDark ? "text-white/55"             : "text-gray-500";
  const muted     = isDark ? "text-white/40"             : "text-gray-400";
  const navBg     = isDark ? "bg-[#060914]/90 border-white/5" : "bg-white/95 border-blue-50 shadow-sm shadow-blue-900/5";
  const cardBg    = isDark ? "bg-white/[0.03] border-white/8" : "bg-white border-gray-100 shadow-md shadow-blue-900/5";
  const altSection = isDark ? "bg-white/[0.02]"          : "bg-blue-50/40";

  return (
    <div
      className={`min-h-screen ${bg} ${txt} overflow-x-hidden transition-colors duration-300`}
      style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" }}
    >

      {/* ── Nav ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${navBg}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }} transition={spring}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-600/25">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className={`text-lg font-bold tracking-tight ${txt}`}>
              Academia <span className="text-blue-600">HQ</span>
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
      <section className="relative min-h-[calc(100vh-73px)] flex items-center overflow-hidden pt-8 pb-16 lg:pt-0 lg:pb-0">

        {/* Background: gradient sphere + grid */}
        <div className="absolute inset-0 -z-10">
          {isDark ? (
            <>
              <div className="absolute top-0 right-0 h-[700px] w-[700px] rounded-full bg-blue-700/10 blur-[120px]" />
              <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/8 blur-[100px]" />
              <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </>
          ) : (
            <>
              {/* Large soft blue gradient sphere top-right */}
              <div className="absolute -top-32 -right-32 h-[700px] w-[700px] rounded-full bg-gradient-to-bl from-blue-100 via-blue-50 to-transparent opacity-80" />
              <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-blue-600/6 blur-[80px]" />
              <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-blue-500/4 blur-[60px]" />
              {/* Subtle dot grid */}
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(30,64,175,0.6) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
            </>
          )}
        </div>

        <div className="mx-auto max-w-7xl px-6 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[calc(100vh-160px)] lg:min-h-0 lg:py-20">

            {/* ── Left: copy ── */}
            <div className="flex flex-col items-start">

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className={`mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold
                  ${isDark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-700"}`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                </span>
                Nigeria's #1 School Operating System
              </motion.div>

              {/* Heading */}
              <motion.h1
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="text-5xl font-extrabold tracking-tight leading-[1.06] sm:text-6xl xl:text-7xl"
              >
                Manage Your School{" "}
                <span className="relative">
                  <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 bg-clip-text text-transparent">
                    Smarter
                  </span>
                  <motion.span
                    className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-blue-500 to-blue-700"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.8, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className={`mt-6 max-w-lg text-lg md:text-xl leading-relaxed ${sub}`}
              >
                CBT exams, student management, attendance, grades, fees, timetable — all in one place.
                Built for Nigerian schools, ready for yours.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.55 }}
                className="mt-8 flex flex-wrap items-center gap-4"
              >
                <motion.a
                  href="#schools" whileHover={{ scale: 1.05, boxShadow: "0 12px 36px rgba(37,99,235,0.35)" }} whileTap={{ scale: 0.97 }} transition={spring}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30"
                >
                  Find Your School
                  <ArrowRight className="h-4 w-4" />
                </motion.a>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} transition={spring}>
                  <Link
                    to="/register"
                    className={`inline-flex items-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-semibold transition-colors
                      ${isDark ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10" : "border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-50"}`}
                  >
                    <School className="h-4 w-4" />
                    Register Your School
                  </Link>
                </motion.div>
              </motion.div>

              {/* Social proof row */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.75 }}
                className="mt-10 flex items-center gap-5 flex-wrap"
              >
                <div className="flex items-center gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                  <span className={`ml-1 text-xs font-semibold ${muted}`}>Trusted by Nigerian schools</span>
                </div>
                <div className={`h-4 w-px ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span className={`text-xs font-medium ${muted}`}>99.9% uptime</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  <span className={`text-xs font-medium ${muted}`}>9+ modules</span>
                </div>
              </motion.div>
            </div>

            {/* ── Right: Hero image panel ── */}
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex items-center justify-center"
            >
              {/* Background glow circles */}
              <div className={`absolute inset-0 -z-10 ${isDark ? "" : ""}`}>
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[480px] w-[480px] rounded-full ${isDark ? "bg-blue-600/10" : "bg-blue-500/8"} blur-[60px]`} />
                <div className={`absolute -bottom-10 -right-10 h-[280px] w-[280px] rounded-full ${isDark ? "bg-blue-700/12" : "bg-blue-600/6"} blur-[50px]`} />
              </div>

              {/* Main image container */}
              <div className="relative w-full max-w-lg">
                {/* Outer ring decoration */}
                <div className={`absolute inset-0 rounded-3xl ${isDark ? "bg-gradient-to-br from-blue-600/20 to-blue-900/20" : "bg-gradient-to-br from-blue-100/60 to-blue-200/30"} -rotate-2 scale-[1.02]`} />

                {/* Image wrapper with fade */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/20">
                  <img
                    src="/students-hero.png"
                    alt="Nigerian students engaged in computer-based learning"
                    className="w-full h-[420px] object-cover object-top"
                    loading="eager"
                  />
                  {/* Bottom fade for seamless blend */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${isDark ? "from-[#060914]/80 via-transparent to-transparent" : "from-white/20 via-transparent to-transparent"}`} />
                  {/* Left edge fade */}
                  <div className={`absolute inset-y-0 left-0 w-12 bg-gradient-to-r ${isDark ? "from-[#060914]/30 to-transparent" : "from-blue-50/20 to-transparent"}`} />
                  {/* Right edge fade */}
                  <div className={`absolute inset-y-0 right-0 w-12 bg-gradient-to-l ${isDark ? "from-[#060914]/30 to-transparent" : "from-blue-50/20 to-transparent"}`} />
                </div>

                {/* Floating stat card — top left */}
                <motion.div
                  initial={{ opacity: 0, y: 16, x: -16 }} animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{ ...spring, delay: 1.0 }}
                  className="absolute -left-6 top-8"
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                    className={`rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl
                      ${isDark ? "border-white/10 bg-white/8" : "border-white/80 bg-white/90 shadow-blue-900/15"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700">
                        <Users className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>2,400+</div>
                        <div className={`text-[10px] font-medium ${isDark ? "text-white/50" : "text-gray-500"}`}>Students managed</div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>

                {/* Floating stat card — bottom right */}
                <motion.div
                  initial={{ opacity: 0, y: 16, x: 16 }} animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{ ...spring, delay: 1.15 }}
                  className="absolute -right-6 bottom-8"
                >
                  <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    className={`rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl
                      ${isDark ? "border-white/10 bg-white/8" : "border-white/80 bg-white/90 shadow-blue-900/15"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className={`text-base font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>99.9%</div>
                        <div className={`text-[10px] font-medium ${isDark ? "text-white/50" : "text-gray-500"}`}>Uptime guarantee</div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>

                {/* Floating badge — top right */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring, delay: 1.3 }}
                  className="absolute -right-4 top-4"
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className={`rounded-2xl border px-3.5 py-2.5 shadow-lg backdrop-blur-xl
                      ${isDark ? "border-white/10 bg-white/8" : "border-white/80 bg-white/90 shadow-blue-900/15"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                        <Award className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <div className={`text-sm font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>9+</div>
                        <div className={`text-[10px] font-medium ${isDark ? "text-white/50" : "text-gray-500"}`}>Modules</div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Divider wave / gradient strip ── */}
      <div className={`h-px w-full ${isDark ? "bg-gradient-to-r from-transparent via-white/8 to-transparent" : "bg-gradient-to-r from-transparent via-blue-200/60 to-transparent"}`} />

      {/* ── School Finder ── */}
      <section id="schools" className={`py-20 ${isDark ? "bg-white/[0.015]" : "bg-blue-50/40"}`}>
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold
              ${isDark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-white text-blue-600"}`}>
              <Search className="h-3 w-3" />
              School Access Portal
            </div>
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Find Your School</h2>
            <p className={`mt-3 text-base ${muted}`}>Type your school name to find and access your portal.</p>
          </motion.div>
          <div className="relative">
            <SchoolFinder />
          </div>
        </div>
      </section>

      <div className={`h-px w-full ${isDark ? "bg-gradient-to-r from-transparent via-white/8 to-transparent" : "bg-gradient-to-r from-transparent via-blue-200/60 to-transparent"}`} />

      {/* ── Features ── */}
      <section id="features" className={`py-24 ${bg}`}>
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold
              ${isDark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-600"}`}>
              <Zap className="h-3 w-3" />
              Platform Features
            </div>
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Everything Your School Needs</h2>
            <p className={`mt-4 text-lg ${sub}`}>From CBT exams to fee management — all in one platform.</p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: i * 0.06 }}
                whileHover={{ y: -6, boxShadow: isDark ? "0 20px 48px rgba(0,0,0,0.4)" : "0 20px 48px rgba(37,99,235,0.12)" }}
                className={`group relative rounded-2xl border p-7 cursor-default overflow-hidden transition-all duration-300 ${cardBg}`}
              >
                {/* Hover glow */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl
                  ${isDark ? "bg-gradient-to-br from-blue-600/5 to-transparent" : "bg-gradient-to-br from-blue-50/80 to-transparent"}`} />

                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.color} shadow-md`}>
                  <f.icon className="h-5.5 w-5.5 h-6 w-6 text-white" />
                </div>
                <h3 className={`text-base font-bold ${txt}`}>{f.title}</h3>
                <p className={`mt-2.5 text-sm leading-relaxed ${muted}`}>{f.desc}</p>

                {/* Bottom accent line on hover */}
                <div className={`absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-500 rounded-full bg-gradient-to-r ${f.color}`} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={`py-24 border-y ${isDark ? "border-white/5 bg-white/[0.02]" : "border-blue-50 bg-blue-50/40"}`}>
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold
              ${isDark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-white text-blue-600"}`}>
              <CheckCircle className="h-3 w-3" />
              Simple Onboarding
            </div>
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${txt}`}>Up and Running in Minutes</h2>
            <p className={`mt-4 text-lg ${sub}`}>Three steps from sign-up to live school portal.</p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3 relative">
            {/* Connector line */}
            <div className={`hidden md:block absolute top-10 left-[33%] right-[33%] h-px
              ${isDark ? "bg-gradient-to-r from-blue-600/30 via-blue-600/50 to-blue-600/30" : "bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200"}`} />

            {[
              { step: "01", title: "School Gets Onboarded",      desc: "Super admin creates your school, assigns an admin and generates your unique school login URL.", color: "from-blue-500 to-blue-700" },
              { step: "02", title: "Admin Sets Everything Up",   desc: "Add sessions, classes, subjects, instructors and students. Configure fees, grades and timetable.",  color: "from-blue-600 to-indigo-600" },
              { step: "03", title: "Teaching & Learning Begins", desc: "Instructors manage their classes. Students access exams, view results, timetables and fees.",       color: "from-indigo-500 to-blue-700" },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: i * 0.14 }}
                className="relative flex flex-col items-center text-center md:items-start md:text-left"
              >
                <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white text-lg font-extrabold shadow-lg shadow-blue-600/25 z-10`}>
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
      <section className={`py-16 ${bg}`}>
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className={`relative overflow-hidden rounded-3xl border p-8 sm:p-12 text-center
              ${isDark
                ? "border-blue-500/20 bg-gradient-to-br from-blue-900/20 via-[#060914] to-blue-900/10"
                : "border-blue-200 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800"}`}
          >
            {/* Decorative circles */}
            <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
              <School className="h-7 w-7 text-white" />
            </div>
            <h2 className={`text-2xl font-extrabold sm:text-3xl mb-3 ${isDark ? txt : "text-white"}`}>Is Your School Not Listed?</h2>
            <p className={`text-base max-w-lg mx-auto mb-8 ${isDark ? sub : "text-blue-100"}`}>
              Register your school on Academia HQ. Submit a quick application and our team will review it within 24–48 hours.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={spring}>
                <Link
                  to="/register"
                  className={`inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold shadow-lg
                    ${isDark ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-blue-500/30" : "bg-white text-blue-700 shadow-white/20 hover:bg-blue-50"}`}
                >
                  Register Your School
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <p className={`text-xs ${isDark ? muted : "text-blue-200"}`}>Free to apply · No credit card required</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Demo Request ── */}
      <RequestDemoSection />

      {/* ── Footer ── */}
      <footer className={`border-t py-10 ${isDark ? "border-white/5" : "border-blue-100"}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className={`text-sm font-bold ${txt}`}>Academia <span className="text-blue-600">HQ</span></span>
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
    try { return (localStorage.getItem("academiahq-theme") as Theme) || "light"; }
    catch { return "light"; }
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
