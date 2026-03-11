import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, GraduationCap, BookOpen, Clock, BarChart3, Shield, Users, Zap, ArrowRight, CheckCircle2, Search, School } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const features = [
  { icon: BookOpen, title: "Smart Exam Builder", description: "Create rich, multimedia exams with multiple question types in minutes.", color: "bg-primary/10 text-primary" },
  { icon: Clock, title: "Timed Assessments", description: "Auto-timed exams with countdowns ensure fair, consistent testing.", color: "bg-secondary/10 text-secondary" },
  { icon: BarChart3, title: "Instant Results", description: "Automatic grading and analytics give immediate insights.", color: "bg-accent/10 text-accent" },
  { icon: Shield, title: "Secure & Reliable", description: "Role-based access and encrypted data protect exam integrity.", color: "bg-destructive/10 text-destructive" },
  { icon: Users, title: "Multi-Tenant", description: "Each school gets their own space with separate data, branding, and login.", color: "bg-primary/10 text-primary" },
  { icon: Zap, title: "Lightning Fast", description: "Optimized for speed so exams load instantly, even on slower connections.", color: "bg-secondary/10 text-secondary" },
];

const stats = [
  { value: "99.9%", label: "Uptime" },
  { value: "<1s", label: "Load Time" },
  { value: "∞", label: "Scalability" },
  { value: "24/7", label: "Availability" },
];

interface SchoolItem {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
}

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
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Academia</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/super-admin/login">Platform Admin</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-[400px] w-[400px] rounded-full bg-secondary/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm"
            >
              <Zap className="h-3.5 w-3.5 text-accent" />
              Multi-School CBT Platform
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
            >
              The Future of{" "}
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Computer-Based Testing
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
            >
              Academia powers seamless, secure, and intelligent online examinations for schools worldwide.
              Find your school below to get started.
            </motion.p>
          </div>
        </div>
      </section>

      {/* School Finder */}
      <section className="border-y border-border bg-card/50 py-16">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Find Your School</h2>
            <p className="mt-3 text-muted-foreground">Select your school to access the student or staff portal.</p>
          </motion.div>

          <div className="relative max-w-md mx-auto mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loadingSchools ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredSchools.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <School className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>{searchQuery ? "No schools match your search." : "No schools registered yet."}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSchools.map((school, i) => (
                <motion.div
                  key={school.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <Link
                    to={`/school/${school.slug}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-primary/30"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 overflow-hidden">
                      {school.logo_url ? (
                        <img src={school.logo_url} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <School className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{school.name}</h3>
                      <p className="text-xs text-muted-foreground">Click to login</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 md:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <div className="text-3xl font-extrabold tracking-tight text-primary md:text-4xl">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything Schools Need
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built for schools that want reliable, efficient, and fair examination systems.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}>
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">How It Works</h2>
            <p className="mt-4 text-lg text-muted-foreground">From setup to results in three simple steps.</p>
          </motion.div>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            {[
              { step: "01", title: "Super Admin Adds School", description: "Create a school, assign an admin, and share the unique login URL." },
              { step: "02", title: "School Admin Configures", description: "Add classes, subjects, instructors, and students. Create and publish exams." },
              { step: "03", title: "Students Take Exams", description: "Students log in via their school's portal, take timed exams, and get instant results." },
            ].map((item, i) => (
              <motion.div key={item.step} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-extrabold shadow-lg shadow-primary/20">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold">{item.title}</h3>
                <p className="mt-2 text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground shadow-2xl shadow-primary/20 md:p-16"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to Get Started?</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Join schools using Academia for seamless computer-based testing.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              {["Multi-School Support", "Secure Environment", "24/7 Access", "Real-time Analytics"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-medium text-primary-foreground/90">
                  <CheckCircle2 className="h-4 w-4" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">Academia</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Modern Multi-School Computer-Based Testing Platform
            </p>
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
