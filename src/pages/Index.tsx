import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { Loader2, GraduationCap, BarChart3, Shield, Users, Zap, ArrowRight, CheckCircle2, Search, School, Bell, CalendarDays, DollarSign, ClipboardList, Award, ChevronRight, Sun, Moon, MessageCircle } from "lucide-react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import RequestDemoSection from "@/components/RequestDemoSection";

// ── Theme Context ─────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});
function useTheme() { return useContext(ThemeContext); }

interface SchoolItem { id: string; name: string; slug: string; logo_url: string; }

const features = [
  { icon: ClipboardList, title: "CBT Examinations",       description: "Create, publish and auto-grade timed computer-based exams with rich question types and instant results.", color: "from-violet-500 to-purple-600", glow: "shadow-violet-500/30" },
  { icon: Users,         title: "Student Management",     description: "Enroll students, manage profiles, assign classes and track their academic journey all in one place.",          color: "from-blue-500 to-cyan-600",   glow: "shadow-blue-500/30"   },
  { icon: CalendarDays,  title: "Timetable & Attendance", description: "Schedule classes, manage periods and track daily attendance with ease.",                                       color: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/30"},
  { icon: Award,         title: "Grades & Reports",       description: "Record scores, compute weighted grades and generate detailed academic report cards.",                          color: "from-orange-500 to-amber-600", glow: "shadow-orange-500/30" },
  { icon: DollarSign,    title: "Fee Management",         description: "Create fee types, record payments, track outstanding balances and generate receipts.",                         color: "from-pink-500 to-rose-600",   glow: "shadow-pink-500/30"   },
  { icon: Bell,          title: "Announcements",          description: "Broadcast targeted announcements to students, staff or specific classes instantly.",                           color: "from-indigo-500 to-blue-600", glow: "shadow-indigo-500/30" },
  { icon: Shield,        title: "Role-Based Access",      description: "Super admins, school admins, instructors and students each get precisely scoped access.",                     color: "from-slate-500 to-gray-600",  glow: "shadow-slate-500/30"  },
  { icon: BarChart3,     title: "Analytics & Insights",   description: "Track exam performance, attendance trends and fee collection with real-time dashboards.",                     color: "from-teal-500 to-cyan-600",   glow: "shadow-teal-500/30"   },
  { icon: Zap,           title: "Multi-School Platform",  description: "Each school gets a branded portal with its own data, settings and login URL.",                                color: "from-yellow-500 to-orange-500",glow: "shadow-yellow-500/30" },
];

const steps = [
  { step: "01", title: "School Gets Onboarded",      description: "Super admin creates a school, assigns an admin and generates a unique school login URL.", accent: "bg-violet-500", shadow: "shadow-violet-500/40" },
  { step: "02", title: "Admin Sets Everything Up",   description: "Add sessions, classes, subjects, instructors and students. Configure fees, grades and timetable.", accent: "bg-blue-500", shadow: "shadow-blue-500/40" },
  { step: "03", title: "Teaching & Learning Begins", description: "Instructors manage their classes. Students access exams, view results, check timetables and fees.", accent: "bg-emerald-500", shadow: "shadow-emerald-500/40" },
];

const spring       = { type: "spring" as const, stiffness: 400, damping: 28 };
const gentleSpring = { type: "spring" as const, stiffness: 200, damping: 20 };

function FloatingOrb({ className }: { className: string }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`}
      animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
    />
  );
}

function useCursorGlow() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 20 });
  const springY = useSpring(y, { stiffness: 120, damping: 20 });
  const handleMove = useCallback((e: MouseEvent) => { x.set(e.clientX); y.set(e.clientY); }, [x, y]);
  useEffect(() => {
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [handleMove]);
  return { springX, springY };
}

// ── Theme Toggle Button ───────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.93 }}
      transition={spring}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-all duration-200
        ${theme === "dark"
          ? "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-sm"
        }`}
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

// ── School search with live suggestions ──────────────────────────────────────
function SchoolFinder() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<SchoolItem[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [focused,     setFocused]     = useState(false);
  const [selected,    setSelected]    = useState<SchoolItem | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropRef     = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) { setFocused(false); }
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
  const handleSelect = (school: SchoolItem) => {
    setSelected(school); setQuery(school.name); setSuggestions([]); setFocused(false);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); }
  };

  return (
    <div className="mx-auto max-w-lg">
      <motion.div className="relative" animate={{ scale: focused ? 1.02 : 1 }} transition={spring}>
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${isDark ? "text-white/30" : "text-gray-400"}`} />
        {searching && (
          <motion.div className="absolute right-4 top-1/2 -translate-y-1/2" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="h-4 w-4 text-violet-400" />
          </motion.div>
        )}
        <motion.input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type your school name…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-2xl border pl-11 pr-11 py-4 text-sm focus:outline-none transition-all
            ${isDark
              ? "bg-white/5 text-white placeholder:text-white/30"
              : "bg-white text-gray-900 placeholder:text-gray-400 shadow-sm"
            }`}
          animate={{
            borderColor: focused ? "rgba(139,92,246,0.6)" : isDark ? "rgba(255,255,255,0.10)" : "rgba(209,213,219,1)",
            boxShadow:   focused ? "0 0 28px rgba(139,92,246,0.18)" : "none",
          }}
        />
      </motion.div>

      <AnimatePresence>
        {showDrop && (
          <motion.div
            ref={dropRef}
            key="dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ ...spring, duration: 0.18 }}
            className={`absolute z-50 mt-2 w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden
              ${isDark ? "border-white/10 bg-[#13131f] shadow-black/60" : "border-gray-200 bg-white shadow-gray-200/80"}`}
          >
            {suggestions.length === 0 && !searching ? (
              <div className={`flex flex-col items-center gap-2 py-8 ${isDark ? "text-white/30" : "text-gray-400"}`}>
                <School className="h-8 w-8 opacity-40" />
                <p className="text-sm">No schools found for "<span className={isDark ? "text-white/50" : "text-gray-600"}>{query}</span>"</p>
                <p className="text-xs opacity-60">Check the spelling and try again</p>
              </div>
            ) : (
              <ul className={`divide-y ${isDark ? "divide-white/5" : "divide-gray-100"}`}>
                {suggestions.map((school, i) => (
                  <motion.li key={school.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.04 }}>
                    <Link
                      to={`/school/${school.slug}`}
                      onClick={() => handleSelect(school)}
                      className={`group flex items-center gap-3 px-4 py-3.5 transition-colors
                        ${isDark ? "hover:bg-violet-500/10" : "hover:bg-violet-50"}`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 overflow-hidden">
                        {school.logo_url
                          ? <img src={school.logo_url} alt="" className="h-full w-full object-contain" />
                          : <School className="h-4 w-4 text-violet-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <HighlightMatch text={school.name} query={query} isDark={isDark} />
                        <p className={`text-xs mt-0.5 ${isDark ? "text-white/30" : "text-gray-400"}`}>Click to access portal</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-colors ${isDark ? "text-white/20 group-hover:text-violet-400" : "text-gray-300 group-hover:text-violet-500"}`} />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!query && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`mt-4 text-center text-xs ${isDark ? "text-white/25" : "text-gray-400"}`}>
            Start typing your school name to see suggestions
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={spring} className="mt-4">
            <Link
              to={`/school/${selected.slug}`}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 transition-colors group
                ${isDark ? "border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15" : "border-violet-200 bg-violet-50 hover:bg-violet-100"}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 overflow-hidden">
                  {selected.logo_url
                    ? <img src={selected.logo_url} alt="" className="h-full w-full object-contain" />
                    : <School className="h-4 w-4 text-violet-400" />
                  }
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-white/90" : "text-gray-900"}`}>{selected.name}</p>
                  <p className="text-xs text-violet-500">Tap to go to portal →</p>
                </div>
              </div>
              <motion.div whileHover={{ x: 3 }} transition={spring}>
                <ArrowRight className="h-4 w-4 text-violet-400 group-hover:text-violet-300" />
              </motion.div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HighlightMatch({ text, query, isDark }: { text: string; query: string; isDark: boolean }) {
  if (!query.trim()) return <span className={`text-sm font-medium ${isDark ? "text-white/90" : "text-gray-900"}`}>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return <span className={`text-sm font-medium ${isDark ? "text-white/90" : "text-gray-900"}`}>{text}</span>;
  return (
    <span className={`text-sm font-medium ${isDark ? "text-white/90" : "text-gray-900"}`}>
      {text.slice(0, idx)}
      <span className="text-violet-500 font-semibold">{text.slice(idx, idx + query.trim().length)}</span>
      {text.slice(idx + query.trim().length)}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, role, loading } = useAuth();
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const { springX, springY } = useCursorGlow();

  const whatsappLink = "https://wa.me/2349039580317";

  if (loading) return (
    <div className={`flex min-h-screen items-center justify-center ${isDark ? "bg-[#0a0a0f]" : "bg-gray-50"}`}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
        <Loader2 className="h-8 w-8 text-violet-400" />
      </motion.div>
    </div>
  );

  if (user) {
    if (role === "super_admin")      return <Navigate to="/super-admin" replace />;
    if (role === "outreach_officer") return <Navigate to="/outreach" replace />;
    if (role === "admin")            return <Navigate to="/admin" replace />;
    if (role === "instructor")       return <Navigate to="/instructor" replace />;
    if (role === "parent")           return <Navigate to="/parent" replace />;
    if (role === "student")          return <Navigate to="/student" replace />;
    return (
      <div className={`flex min-h-screen items-center justify-center ${isDark ? "bg-[#0a0a0f]" : "bg-gray-50"}`}>
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  const bg          = isDark ? "bg-[#0a0a0f]"                          : "bg-gray-50";
  const text        = isDark ? "text-white"                             : "text-gray-900";
  const subtext     = isDark ? "text-white/50"                          : "text-gray-500";
  const mutedText   = isDark ? "text-white/40"                          : "text-gray-400";
  const navBg       = isDark ? "bg-[#0a0a0f]/80 border-white/5"        : "bg-white/90 border-gray-200";
  const cardBg      = isDark ? "bg-white/[0.03] border-white/5"        : "bg-white border-gray-100 shadow-sm";
  const sectionAlt  = isDark ? "bg-white/[0.02] border-white/5"        : "bg-white border-gray-100";
  const statCard    = isDark ? "border-white/5 bg-white/[0.03]"        : "border-gray-100 bg-white shadow-sm";
  const footerBorder = isDark ? "border-white/5"                       : "border-gray-200";
  const footerSub   = isDark ? "text-white/30"                         : "text-gray-400";
  const footerCopy  = isDark ? "text-white/20"                         : "text-gray-300";

  return (
    <div className={`min-h-screen ${bg} ${text} overflow-x-hidden transition-colors duration-300`}>

      {isDark && (
        <motion.div
          className="pointer-events-none fixed z-50 h-48 w-48 rounded-full bg-violet-600/10 blur-[80px] hidden lg:block"
          style={{ x: springX, y: springY, translateX: "-50%", translateY: "-50%" }}
        />
      )}

      {/* ── Navigation ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${navBg}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }} transition={spring}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/25">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className={`text-lg font-bold tracking-tight ${text}`}>
              Academia <span className="text-violet-400">HQ</span>
            </span>
          </motion.div>

          {/* Right-hand side: Manage Your School Smarter label + Theme toggle + Contact Us */}
          <div className="flex items-center gap-3">
            {/* Hidden super-admin access — label preserved as spec'd, but now purely decorative text */}
            <Link
              to="/super-admin/login"
              className={`hidden md:inline-flex items-center text-xs font-medium transition-colors
                ${isDark ? "text-white/30 hover:text-white/60" : "text-gray-400 hover:text-gray-600"}`}
              tabIndex={-1}
              aria-hidden="true"
            >
              Manage Your School Smarter
            </Link>

            <ThemeToggle />

            {/* Contact Us → WhatsApp */}
            <motion.a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-green-500/20 hover:shadow-green-500/40 transition-shadow"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Contact Us</span>
            </motion.a>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-20 md:pt-36 md:pb-28">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {isDark ? (
            <>
              <FloatingOrb className="top-0 left-1/2 -translate-x-1/2 h-[600px] w-[600px] bg-violet-600/10" />
              <FloatingOrb className="top-40 right-0 h-[400px] w-[400px] bg-blue-600/8" />
              <FloatingOrb className="bottom-0 left-0 h-[300px] w-[300px] bg-emerald-600/8" />
              <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)",backgroundSize:"60px 60px"}} />
            </>
          ) : (
            <>
              <FloatingOrb className="top-0 left-1/2 -translate-x-1/2 h-[600px] w-[600px] bg-violet-400/8" />
              <FloatingOrb className="top-40 right-0 h-[400px] w-[400px] bg-blue-400/6" />
              <FloatingOrb className="bottom-0 left-0 h-[300px] w-[300px] bg-emerald-400/6" />
              <div className="absolute inset-0 opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,0,0,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.3) 1px,transparent 1px)",backgroundSize:"60px 60px"}} />
            </>
          )}
        </div>

        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-400"
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-violet-400"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            Complete School Management System
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl leading-[1.05]"
          >
            Manage Your School{" "}
            <motion.span
              className="relative inline-block"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                Smarter
              </span>
              <motion.span
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className={`mx-auto mt-8 max-w-2xl text-lg md:text-xl leading-relaxed ${subtext}`}
          >
            Academia HQ is the all-in-one platform for modern schools — CBT exams, student management,
            attendance, grades, fees, timetable and more. All in one place.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <motion.a
              href="#schools"
              whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(139,92,246,0.4)" }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25"
            >
              Find Your School
              <motion.span animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <ArrowRight className="h-4 w-4" />
              </motion.span>
            </motion.a>
            <motion.a
              href="#features"
              whileHover={{ scale: 1.04, backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)" }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className={`inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold
                ${isDark ? "border-white/10 bg-white/5 text-white/80" : "border-gray-200 bg-white text-gray-700 shadow-sm"}`}
            >
              Explore Features
            </motion.a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-2xl mx-auto"
          >
            {[
              { value: "9+",    label: "Core Modules"   },
              { value: "99.9%", label: "Uptime"         },
              { value: "Multi", label: "School Support" },
              { value: "24/7",  label: "Availability"   },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.75 + i * 0.07 }}
                whileHover={{ scale: 1.06, borderColor: "rgba(139,92,246,0.4)", backgroundColor: "rgba(139,92,246,0.06)" }}
                className={`rounded-2xl border px-4 py-4 text-center backdrop-blur cursor-default ${statCard}`}
              >
                <div className={`text-2xl font-extrabold ${text}`}>{stat.value}</div>
                <div className={`mt-1 text-xs ${mutedText}`}>{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── School Finder ── */}
      <section id="schools" className={`py-20 border-y ${sectionAlt}`}>
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${text}`}>Find Your School</h2>
            <p className={`mt-3 ${mutedText}`}>Type your school name to find and access your portal.</p>
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${text}`}>Everything Your School Needs</h2>
            <p className={`mt-4 text-lg ${mutedText}`}>From CBT exams to fee management — Academia HQ covers every aspect of school administration.</p>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ ...gentleSpring, delay: i * 0.06 }}
                whileHover={{ y: -6, scale: 1.02 }}
                onHoverStart={() => setHoveredFeature(feature.title)}
                onHoverEnd={() => setHoveredFeature(null)}
                className={`group relative rounded-2xl border p-6 cursor-default overflow-hidden ${cardBg}`}
              >
                <motion.div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300`} />
                <motion.div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg ${feature.glow}`}
                  whileHover={{ scale: 1.15, rotate: [0, -8, 8, 0] }}
                  transition={{ duration: 0.4 }}
                >
                  <feature.icon className="h-5 w-5 text-white" />
                </motion.div>
                <h3 className={`text-base font-bold relative ${text} opacity-90`}>{feature.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed relative ${mutedText}`}>{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={`py-24 border-t ${sectionAlt}`}>
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${text}`}>How It Works</h2>
            <p className={`mt-4 text-lg ${mutedText}`}>Get your school up and running in minutes.</p>
          </motion.div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ ...gentleSpring, delay: i * 0.12 }}
                whileHover={{ y: -4 }}
                className="relative"
              >
                {i < steps.length - 1 && (
                  <motion.div
                    initial={{ scaleX: 0, originX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: i * 0.2 + 0.4 }}
                    className={`hidden md:block absolute top-7 left-full w-full h-px bg-gradient-to-r -translate-x-8 z-0
                      ${isDark ? "from-white/15 to-transparent" : "from-gray-300 to-transparent"}`}
                  />
                )}
                <motion.div
                  whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 0.4 }}
                  className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${item.accent} text-white text-xl font-extrabold shadow-lg ${item.shadow}`}
                >
                  {item.step}
                </motion.div>
                <h3 className={`text-xl font-bold ${text} opacity-90`}>{item.title}</h3>
                <p className={`mt-2 leading-relaxed ${mutedText}`}>{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl p-12 text-center md:p-20"
            style={{ background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #059669 100%)" }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
              transition={{ duration: 12, repeat: Infinity, repeatType: "mirror", ease: "linear" }}
              style={{
                backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 60%)",
                backgroundSize: "200% 200%",
              }}
            />
            <div className="absolute inset-0 opacity-10" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.3) 1px,transparent 1px)",backgroundSize:"40px 40px"}} />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
                Ready to Transform Your School?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
                Join schools using Academia HQ for complete school management — from CBT exams to fee tracking.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                {["CBT Examinations", "Student Management", "Fee Tracking", "Grade Reports", "Attendance"].map((item, i) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: i * 0.08 }}
                    whileHover={{ scale: 1.08 }}
                    className="flex items-center gap-2 text-sm font-medium text-white/80"
                  >
                    <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ ...spring, delay: i * 0.08 + 0.2 }}>
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </motion.div>
                    {item}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Implementation / Demo Request ── */}
      <RequestDemoSection />

      {/* ── Footer ── */}
      <footer className={`border-t py-10 ${footerBorder}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.04 }} transition={spring}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className={`text-sm font-bold ${text}`}>Academia <span className="text-violet-400">HQ</span></span>
            </motion.div>
            <p className={`text-sm ${footerSub}`}>Complete School Management System — CBT, Grades, Fees, Attendance &amp; More</p>
            <p className={`text-xs ${footerCopy}`}>© {new Date().getFullYear()} Academia HQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Root export wraps the page in the ThemeProvider ───────────────────────────
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
