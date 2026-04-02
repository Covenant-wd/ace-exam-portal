import { useState, useEffect } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GraduationCap, Loader2, Eye, EyeOff, BookOpen, Users, Shield, Heart, ChevronRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
}

type LoginRole = "student" | "parent" | "instructor" | "admin";

const roleConfig: Record<LoginRole, { label: string; icon: any; color: string; inputLabel: string; inputType: string; placeholder: string; description: string }> = {
  student: { label: "Student", icon: BookOpen, color: "from-blue-500 to-cyan-500", inputLabel: "Username", inputType: "text", placeholder: "Your username", description: "Access your exams & results" },
  parent:  { label: "Parent",  icon: Heart,    color: "from-pink-500 to-rose-500",  inputLabel: "Username", inputType: "text", placeholder: "Your username", description: "Track your child's progress" },
  instructor: { label: "Instructor", icon: Users, color: "from-violet-500 to-purple-500", inputLabel: "Email", inputType: "email", placeholder: "instructor@school.com", description: "Manage classes & grades" },
  admin: { label: "Admin", icon: Shield, color: "from-amber-500 to-orange-500", inputLabel: "Email", inputType: "email", placeholder: "admin@school.com", description: "Full school management" },
};

export default function SchoolLogin() {
  const { slug } = useParams<{ slug: string }>();
  const { user, role, loading: authLoading, signIn } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeRole, setActiveRole] = useState<LoginRole>("student");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchSchool = async () => {
      const { data, error } = await supabase.from("schools").select("*").eq("slug", slug).single();
      if (error || !data) { setNotFound(true); } else { setSchool(data as School); }
      setLoadingSchool(false);
    };
    if (slug) fetchSchool();
  }, [slug]);

  // Reset fields when role changes
  useEffect(() => { setIdentifier(""); setPassword(""); }, [activeRole]);

  if (loadingSchool || authLoading || (user && !role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f14]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center animate-pulse">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f14] gap-5 text-white">
        <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center">
          <GraduationCap className="h-8 w-8 text-white/40" />
        </div>
        <h1 className="text-2xl font-bold">School Not Found</h1>
        <p className="text-white/40">The school "{slug}" doesn't exist.</p>
        <Link to="/" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" /> Back to Home
        </Link>
      </div>
    );
  }

  if (user) {
    if (role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (role === "outreach_officer") return <Navigate to="/outreach" replace />;
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "instructor") return <Navigate to="/instructor" replace />;
    if (role === "parent") return <Navigate to="/parent" replace />;
    if (role === "student") return <Navigate to="/student" replace />;
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (activeRole === "student" || activeRole === "parent") {
        const { data: emailData, error: emailError } = await supabase.rpc("get_email_by_username", {
          _username: identifier.trim(),
          _school_id: school!.id,
        });
        if (emailError || !emailData) {
          toast.error("Username not found. Please check and try again.");
          setSubmitting(false);
          return;
        }
        const { error } = await signIn(emailData, password);
        if (error) toast.error("Incorrect password. Please try again.");
      } else {
        const { error } = await signIn(identifier, password);
        if (error) toast.error(error.message);
      }
    } catch {
      toast.error("Login failed. Please try again.");
    }
    setSubmitting(false);
  };

  const cfg = roleConfig[activeRole];
  const RoleIcon = cfg.icon;

  return (
    <div className="min-h-screen bg-[#0f0f14] flex flex-col lg:flex-row overflow-hidden">

      {/* LEFT PANEL - School Info */}
      <div className="relative lg:w-[45%] flex flex-col justify-between p-8 lg:p-12 bg-gradient-to-br from-[#13131a] to-[#0f0f14] border-b lg:border-b-0 lg:border-r border-white/5">

        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-600/8 blur-[100px]" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-blue-600/8 blur-[80px]" />
          <div className="absolute inset-0 opacity-[0.015]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",backgroundSize:"50px 50px"}} />
        </div>

        <div className="relative z-10">
          {/* Academia HQ branding */}
          <div className="flex items-center gap-2.5 mb-12 lg:mb-16">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white/60">Academia <span className="text-violet-400">HQ</span></span>
          </div>

          {/* School logo & name */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 border border-white/10 overflow-hidden shadow-xl">
              {school?.logo_url ? (
                <img src={school.logo_url} alt="School logo" className="h-full w-full object-contain" />
              ) : (
                <GraduationCap className="h-10 w-10 text-white/40" />
              )}
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-white leading-tight mb-3">
              {school?.name}
            </h1>
            <p className="text-white/40 text-base leading-relaxed max-w-sm">
              Welcome to the official student and staff portal. Sign in to access your personalised academic experience.
            </p>
          </motion.div>
        </div>

        {/* Role cards - show on desktop */}
        <div className="relative z-10 hidden lg:block">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4 font-medium">Portal Access</p>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(roleConfig) as [LoginRole, typeof cfg][]).map(([key, config]) => {
              const Icon = config.icon;
              const isActive = activeRole === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveRole(key)}
                  className={`flex items-center gap-3 rounded-xl p-3 text-left transition-all border ${
                    isActive
                      ? "bg-white/8 border-white/20"
                      : "bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold leading-none mb-0.5 ${isActive ? "text-white" : "text-white/60"}`}>{config.label}</p>
                    <p className="text-xs text-white/30 leading-none">{config.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 hidden lg:flex items-center gap-2 mt-8">
          <div className="flex items-center gap-1.5 text-xs text-white/20">
            <Zap className="h-3 w-3 text-violet-400" />
            <span>Powered by <span className="text-white/40">Academia HQ</span></span>
          </div>
          <span className="text-white/10">·</span>
          <span className="text-xs text-white/20">School Management System</span>
        </div>
      </div>

      {/* RIGHT PANEL - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">

          {/* Mobile role selector */}
          <div className="lg:hidden mb-8">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3 font-medium">Sign in as</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(roleConfig) as [LoginRole, typeof cfg][]).map(([key, config]) => {
                const Icon = config.icon;
                const isActive = activeRole === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveRole(key)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-all border ${
                      isActive ? "bg-white/8 border-white/20" : "bg-white/3 border-white/5"
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center`}>
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className={`text-xs font-medium ${isActive ? "text-white" : "text-white/40"}`}>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form header */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRole}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mb-8"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${cfg.color} shadow-lg mb-4`}>
                <RoleIcon className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-1">{cfg.label} Sign In</h2>
              <p className="text-white/40 text-sm">{cfg.description}</p>
            </motion.div>
          </AnimatePresence>

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.form
              key={activeRole}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Identifier input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/60">{cfg.inputLabel}</label>
                <input
                  type={cfg.inputType}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder={cfg.placeholder}
                  required
                  autoComplete={cfg.inputType === "email" ? "email" : "username"}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-all"
                />
              </div>

              {/* Password input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full rounded-xl bg-gradient-to-r ${cfg.color} py-3 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2 mt-6`}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  <>Sign In as {cfg.label} <ChevronRight className="h-4 w-4" /></>
                )}
              </button>
            </motion.form>
          </AnimatePresence>

          {/* Help text */}
          <p className="mt-6 text-center text-xs text-white/25">
            {activeRole === "student" || activeRole === "parent"
              ? "Don't have credentials? Contact your school admin."
              : "Having trouble? Contact your school administrator."}
          </p>

          {/* Mobile powered by */}
          <div className="lg:hidden flex items-center justify-center gap-1.5 mt-8 text-xs text-white/20">
            <Zap className="h-3 w-3 text-violet-400" />
            <span>Powered by <span className="text-white/40">Academia HQ</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
