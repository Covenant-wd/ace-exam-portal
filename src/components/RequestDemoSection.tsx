import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  sendImplementationRequestEmail,
  sendImplementationConfirmationEmail,
} from "@/lib/email";
import {
  Building2, User, Phone, Mail, GraduationCap, Users, MapPin,
  MessageSquare, CheckCircle2, Loader2, ChevronDown, CalendarCheck,
  Zap, Shield, HeadphonesIcon, MonitorSmartphone, BookOpenCheck,
  BadgeCheck, ArrowRight, Sparkles,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVICES = [
  { id: "cbt",        label: "CBT Setup",                    icon: MonitorSmartphone },
  { id: "sms",        label: "School Management System",     icon: Building2         },
  { id: "results",    label: "Result Automation",            icon: BookOpenCheck     },
  { id: "fees",       label: "Fee Management",               icon: BadgeCheck        },
  { id: "full",       label: "Full School Digitization",     icon: Sparkles          },
  { id: "training",   label: "Staff Training",               icon: HeadphonesIcon    },
];

const SCHOOL_TYPES = ["Primary", "Secondary", "College", "University", "Other"];

const STUDENT_RANGES = [
  "Under 100", "100 – 300", "300 – 600", "600 – 1,000",
  "1,000 – 3,000", "3,000+",
];

const TRUST_BADGES = [
  { icon: Shield,       text: "Secure & Private"       },
  { icon: Zap,          text: "Quick Response"          },
  { icon: HeadphonesIcon,text: "Dedicated Support"     },
  { icon: GraduationCap,text: "Education Specialists"  },
];

const spring = { type: "spring" as const, stiffness: 380, damping: 28 };

// ─── Form field wrapper ──────────────────────────────────────────────────────

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-blue-500">*</span>}
      </label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-red-500 font-medium"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// Shared input class
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all duration-150 shadow-sm";

// ─── Main section ────────────────────────────────────────────────────────────

export default function RequestDemoSection() {
  // Form state
  const [schoolName,   setSchoolName]   = useState("");
  const [contactName,  setContactName]  = useState("");
  const [phone,        setPhone]        = useState("");
  const [email,        setEmail]        = useState("");
  const [schoolType,   setSchoolType]   = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [location,     setLocation]     = useState("");
  const [services,     setServices]     = useState<string[]>([]);
  const [message,      setMessage]      = useState("");
  const [bookVisit,    setBookVisit]    = useState(false);

  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [submitError,  setSubmitError]  = useState("");

  const formRef = useRef<HTMLDivElement>(null);
  const lastSubmitRef = useRef<number>(0);

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!schoolName.trim())   e.schoolName   = "School name is required.";
    if (!contactName.trim())  e.contactName  = "Contact person is required.";
    if (!phone.trim())        e.phone        = "Phone number is required.";
    if (!email.trim())        e.email        = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                              e.email        = "Enter a valid email address.";
    if (!schoolType)          e.schoolType   = "Please select a school type.";
    if (!studentCount)        e.studentCount = "Please select student range.";
    if (!location.trim())     e.location     = "Location is required.";
    if (services.length === 0)e.services     = "Select at least one service.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error
      formRef.current?.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Client-side rate limit: 60s between submissions
    const now = Date.now();
    if (now - lastSubmitRef.current < 60_000) {
      setSubmitError("Please wait a moment before submitting again.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      // 1. Server-side rate limit check
      const { data: allowed } = await supabase.rpc("check_impl_request_rate_limit", {
        p_email: email.trim().toLowerCase(),
      });
      if (!allowed) {
        setSubmitError("A request from this email was submitted recently. Please try again in an hour.");
        setSubmitting(false);
        return;
      }

      // 2. Save to database
      const { error: insertErr } = await supabase
        .from("implementation_requests")
        .insert({
          school_name:    schoolName.trim(),
          contact_name:   contactName.trim(),
          phone:          phone.trim(),
          email:          email.trim().toLowerCase(),
          school_type:    schoolType,
          student_count:  studentCount,
          location:       location.trim(),
          services_needed: services,
          message:        message.trim() || null,
          book_visit:     bookVisit,
          status:         "New",
        });

      if (insertErr) throw insertErr;

      // 3. Send emails (fire and forget — don't block UX on email delivery)
      const payload = {
        schoolName:    schoolName.trim(),
        contactName:   contactName.trim(),
        phone:         phone.trim(),
        email:         email.trim().toLowerCase(),
        schoolType,
        studentCount,
        location:      location.trim(),
        servicesNeeded: services,
        message:       message.trim() || undefined,
        bookVisit,
      };

      // FIX: Fetch super admin emails from DB instead of a hardcoded address.
      // We query user_roles for every super_admin user, then resolve their
      // emails via the get_user_emails_by_ids RPC (SECURITY DEFINER function
      // that can read auth.users safely from the client).
      (async () => {
        try {
          const { data: superAdminRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "super_admin");
          const superAdminIds = (superAdminRoles || []).map((r: any) => r.user_id);
          if (superAdminIds.length > 0) {
            const { data: emailRows } = await supabase.rpc("get_user_emails_by_ids", {
              _user_ids: superAdminIds,
            });
            const superAdminEmails = (emailRows || [])
              .map((r: any) => r.email)
              .filter(Boolean);
            if (superAdminEmails.length > 0) {
              await sendImplementationRequestEmail({ to: superAdminEmails, ...payload });
            }
          }
        } catch (e) {
          console.error("Implementation request notification failed:", e);
        }
      })();
      // Confirmation to requester — await so errors surface in logs
      try {
        const sent = await sendImplementationConfirmationEmail({
          to:             email.trim().toLowerCase(),
          contactName:    contactName.trim(),
          schoolName:     schoolName.trim(),
          servicesNeeded: services,
        });
        if (!sent) {
          console.error("[RequestDemo] Confirmation email failed to send to:", email.trim().toLowerCase());
        }
      } catch (emailErr) {
        console.error("[RequestDemo] Confirmation email threw:", emailErr);
      }

      lastSubmitRef.current = Date.now();
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Toggle service ──────────────────────────────────────────────────────────

  function toggleService(id: string) {
    setServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
    if (errors.services) setErrors(prev => ({ ...prev, services: "" }));
  }

  // ── Success state ───────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <section id="request-demo" className="py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.1 }}
            className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30 mb-6"
          >
            <CheckCircle2 className="h-10 w-10 text-white" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
            className="text-3xl font-extrabold text-slate-800 tracking-tight"
          >
            Request Received!
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.3 }}
            className="mt-4 text-lg text-slate-500 leading-relaxed"
          >
            Thank you. <strong className="text-slate-700">Academia HQ</strong> will reach out to your school shortly.
            A confirmation has been sent to <strong className="text-blue-600">{email}</strong>.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.4 }}
            className="mt-8 flex flex-wrap justify-center gap-4"
          >
            <a
              href="https://wa.me/2349039580317"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-600 transition-colors"
            >
              {/* WhatsApp icon inline SVG */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Chat on WhatsApp
            </a>
            <button
              onClick={() => setSubmitted(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              Submit Another Request
            </button>
          </motion.div>
        </div>
      </section>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <section id="request-demo" className="relative py-24 overflow-hidden bg-gradient-to-b from-white via-slate-50 to-white">

      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-blue-500/5 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-violet-500/5 blur-[80px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "linear-gradient(rgba(0,0,100,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,100,0.8) 1px,transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6">

        {/* ── Section header ── */}
        <div className="mx-auto max-w-3xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ ...spring }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-600"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            Now Accepting Onboarding Requests
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl"
          >
            Ready to{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                Digitize Your School?
              </span>
              <motion.span
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                initial={{ width: "0%" }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-5 text-lg text-slate-500 leading-relaxed"
          >
            Request a demo, onboarding support, or full implementation guidance for your school.
            Our specialists will reach out within 24 hours.
          </motion.p>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            {TRUST_BADGES.map((b, i) => (
              <motion.div
                key={b.text}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: 0.3 + i * 0.07 }}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm"
              >
                <b.icon className="h-3.5 w-3.5 text-blue-500" />
                {b.text}
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid gap-12 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] items-start">

          {/* Left: Form */}
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <form onSubmit={handleSubmit} noValidate>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">

                {/* Card header */}
                <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-6">
                  <h3 className="text-lg font-bold text-white">Implementation Request Form</h3>
                  <p className="mt-1 text-sm text-white/70">Fill in the details below — all fields marked * are required.</p>
                </div>

                <div className="px-8 py-8 space-y-6">

                  {/* Row 1: School name + Contact */}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="School Name" required error={errors.schoolName}>
                      <div className="relative" data-error={errors.schoolName || undefined}>
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="e.g. Green Valley Academy"
                          value={schoolName}
                          onChange={e => { setSchoolName(e.target.value); if (errors.schoolName) setErrors(p => ({...p, schoolName: ""})); }}
                          className={`${inputCls} pl-10 ${errors.schoolName ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        />
                      </div>
                    </Field>
                    <Field label="Contact Person" required error={errors.contactName}>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Full name"
                          value={contactName}
                          onChange={e => { setContactName(e.target.value); if (errors.contactName) setErrors(p => ({...p, contactName: ""})); }}
                          className={`${inputCls} pl-10 ${errors.contactName ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        />
                      </div>
                    </Field>
                  </div>

                  {/* Row 2: Phone + Email */}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Phone Number" required error={errors.phone}>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="tel"
                          placeholder="+234 800 000 0000"
                          value={phone}
                          onChange={e => { setPhone(e.target.value); if (errors.phone) setErrors(p => ({...p, phone: ""})); }}
                          className={`${inputCls} pl-10 ${errors.phone ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        />
                      </div>
                    </Field>
                    <Field label="Email Address" required error={errors.email}>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          placeholder="you@school.edu"
                          value={email}
                          onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({...p, email: ""})); }}
                          className={`${inputCls} pl-10 ${errors.email ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        />
                      </div>
                    </Field>
                  </div>

                  {/* Row 3: School Type + Students */}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="School Type" required error={errors.schoolType}>
                      <div className="relative">
                        <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <select
                          value={schoolType}
                          onChange={e => { setSchoolType(e.target.value); if (errors.schoolType) setErrors(p => ({...p, schoolType: ""})); }}
                          className={`${inputCls} pl-10 pr-10 appearance-none cursor-pointer ${errors.schoolType ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        >
                          <option value="">Select type…</option>
                          {SCHOOL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </Field>
                    <Field label="Number of Students" required error={errors.studentCount}>
                      <div className="relative">
                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <select
                          value={studentCount}
                          onChange={e => { setStudentCount(e.target.value); if (errors.studentCount) setErrors(p => ({...p, studentCount: ""})); }}
                          className={`${inputCls} pl-10 pr-10 appearance-none cursor-pointer ${errors.studentCount ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                        >
                          <option value="">Select range…</option>
                          {STUDENT_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </Field>
                  </div>

                  {/* Location */}
                  <Field label="School Location" required error={errors.location}>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="City, State — e.g. Lagos, Lagos State"
                        value={location}
                        onChange={e => { setLocation(e.target.value); if (errors.location) setErrors(p => ({...p, location: ""})); }}
                        className={`${inputCls} pl-10 ${errors.location ? "border-red-300 focus:ring-red-200 focus:border-red-400" : ""}`}
                      />
                    </div>
                  </Field>

                  {/* Services needed */}
                  <Field label="Services Needed" required error={errors.services}>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {SERVICES.map(svc => {
                        const active = services.includes(svc.id);
                        return (
                          <motion.button
                            key={svc.id}
                            type="button"
                            onClick={() => toggleService(svc.id)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            transition={spring}
                            className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left text-xs font-semibold transition-all ${
                              active
                                ? "border-blue-400 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                            }`}
                          >
                            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-blue-500" : "bg-slate-200"} transition-colors`}>
                              <svc.icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-slate-500"}`} />
                            </div>
                            {svc.label}
                            {active && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="ml-auto -mt-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                              </motion.div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </Field>

                  {/* Message */}
                  <Field label="Message / Additional Information">
                    <div className="relative">
                      <MessageSquare className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                      <textarea
                        rows={4}
                        placeholder="Tell us more about your school, challenges, or specific needs…"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className={`${inputCls} pl-10 resize-none`}
                      />
                    </div>
                  </Field>

                  {/* Book visit toggle */}
                  <motion.label
                    whileHover={{ scale: 1.01 }}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-white hover:border-blue-200 transition-all"
                  >
                    <div className="relative mt-0.5">
                      <input
                        type="checkbox"
                        checked={bookVisit}
                        onChange={e => setBookVisit(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors ${bookVisit ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"}`}>
                        {bookVisit && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <CalendarCheck className="h-4 w-4 text-blue-500" />
                        Book a Physical School Visit
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Our team will schedule a physical visit to your school for hands-on setup and training.
                      </p>
                    </div>
                  </motion.label>

                  {/* Error banner */}
                  <AnimatePresence>
                    {submitError && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                      >
                        {submitError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit button */}
                  <motion.button
                    type="submit"
                    disabled={submitting}
                    whileHover={{ scale: submitting ? 1 : 1.02, boxShadow: "0 8px 30px rgba(37,99,235,0.35)" }}
                    whileTap={{ scale: 0.98 }}
                    transition={spring}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 text-sm font-bold text-white shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                    ) : (
                      <>Submit Request <ArrowRight className="h-4 w-4" /></>
                    )}
                  </motion.button>

                  <p className="text-center text-xs text-slate-400">
                    By submitting, you agree that Academia HQ may contact you about this request.
                    No spam — ever.
                  </p>
                </div>
              </div>
            </form>
          </motion.div>

          {/* Right: Info panel */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6 lg:sticky lg:top-24"
          >

            {/* What happens next */}
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-200/50">
              <h3 className="text-base font-extrabold text-slate-800 mb-5">What Happens Next?</h3>
              <ol className="space-y-5">
                {[
                  { step: "01", title: "Request Received",     desc: "We receive and review your details immediately." },
                  { step: "02", title: "Team Reaches Out",     desc: "An Academia HQ specialist contacts you within 24 hours." },
                  { step: "03", title: "School Onboarding",    desc: "We guide you through setup, training, and deployment." },
                  { step: "04", title: "You Go Live",          desc: "Your school is fully operational on Academia HQ." },
                ].map((item, i) => (
                  <motion.li
                    key={item.step}
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: 0.2 + i * 0.08 }}
                    className="flex items-start gap-4"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-extrabold text-white shadow">
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* Services overview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-200/50">
              <h3 className="text-base font-extrabold text-slate-800 mb-4">Services We Offer</h3>
              <ul className="space-y-3">
                {[
                  "Platform onboarding & initial setup",
                  "CBT deployment & exam configuration",
                  "Staff & teacher training",
                  "Data migration & student import",
                  "Physical school visit & setup",
                  "Ongoing technical support",
                ].map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: 8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: 0.15 + i * 0.06 }}
                    className="flex items-center gap-3 text-sm text-slate-600"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    {item}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* WhatsApp CTA */}
            <motion.a
              href="https://wa.me/2349039580317"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.03, boxShadow: "0 8px 28px rgba(37,211,102,0.3)" }}
              whileTap={{ scale: 0.98 }}
              transition={spring}
              className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 group shadow-sm"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-500/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-emerald-800">Prefer to chat directly?</p>
                <p className="text-xs text-emerald-600 mt-0.5">Message us on WhatsApp for instant response.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-emerald-500 group-hover:translate-x-1 transition-transform shrink-0" />
            </motion.a>

          </motion.div>
        </div>
      </div>
    </section>
  );
}
