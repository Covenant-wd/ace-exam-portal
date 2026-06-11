import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, GraduationCap, CheckCircle2, AlertCircle,
  XCircle, Clock, Search, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Status check helper ───────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: "Under Review",  icon: Clock,        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200" },
  approved: { label: "Approved",      icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200" },
  rejected: { label: "Rejected",      icon: XCircle,      className: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200" },
};

type RequestStatus = "pending" | "approved" | "rejected";

interface StatusResult {
  status: RequestStatus;
  school_name: string;
  rejection_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

export default function SchoolRegistration() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"register" | "status">("register");
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);

  // Registration form state
  const [formData, setFormData] = useState({
    email: "",
    school_name: "",
    contact_person: "",
    phone: "",
    address: "",
    website: "",
  });

  // Status check state
  const [statusEmail, setStatusEmail] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.email.trim() || !formData.school_name.trim() || !formData.contact_person.trim()) {
        toast.error("Please fill in all required fields");
        setLoading(false);
        return;
      }

      const email    = formData.email.trim().toLowerCase();
      const schoolName     = formData.school_name.trim();
      const contactPerson  = formData.contact_person.trim();

      // ── Step 1: Check for duplicate email directly via the DB client.
      // The RLS policy allows unauthenticated SELECT only by matching email in
      // auth.users, so an anonymous user can't read others' rows. We use the
      // service-role-equivalent path by relying on the edge function for this
      // only as a fallback — the primary duplicate check is here using maybeSingle()
      // which returns null (not an error) when no row exists.
      // The anon key can read rows where the RLS policy passes. Since the policy
      // for SELECT is "email = (auth.users where id = auth.uid())" and the user
      // is unauthenticated, auth.uid() is null → the SELECT RLS won't match.
      // BUT — there's also the super_admin policy. Neither applies here.
      // So we skip the client-side check and rely on the DB unique constraint / edge fn.

      // ── Step 2: Insert directly via the Supabase client (anon key).
      // RLS policy "Schools can insert their registration" has WITH CHECK (true),
      // meaning any caller — including unauthenticated — can INSERT. This avoids
      // calling the edge function entirely for the core submission, which was
      // causing FunctionsFetchError (CORS preflight failure when function is not
      // yet deployed or during cold starts on a brand-new Supabase project).
      const { error: insertError } = await (supabase as any)
        .from("school_registration_requests")
        .insert({
          email,
          school_name:    schoolName,
          contact_person: contactPerson,
          phone:   formData.phone?.trim()   || null,
          address: formData.address?.trim() || null,
          website: formData.website?.trim() || null,
          status: "pending",
        });
        // NOTE: No .select() here — the SELECT RLS policies block unauthenticated
        // users from reading back rows. PostgREST translates .select() into an
        // INSERT...RETURNING clause, and a blocked RETURNING is reported by
        // PostgREST as "new row violates row-level security policy". We don't
        // need the returned ID for anything, so simply omit .select().

      if (insertError) {
        // PostgreSQL unique violation on email column
        if (insertError.code === "23505") {
          toast.error("A registration request with this email already exists. Use the 'Check Status' tab to see its current status.");
          setLoading(false);
          return;
        }
        console.error("Insert error:", insertError);
        toast.error(insertError.message || "Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      // ── Step 3: Fire-and-forget — trigger the edge function for email notifications.
      // We do NOT await this or block the success flow on it. If the function is
      // unreachable (not yet deployed, cold-start timeout), the school is already
      // registered and the user sees the success screen.
      supabase.functions
        .invoke("handle-school-registration", { body: { ...formData, _notify_only: true } })
        .catch((err) => {
          // Silently swallow — registration already succeeded above.
          console.warn("[SchoolRegistration] Email notification invoke failed (non-critical):", err?.message);
        });

      toast.success("Registration submitted successfully! We'll review your application within 24–48 hours.");
      setStep("success");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const handleStatusCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusEmail.trim()) return;
    setStatusLoading(true);
    setStatusChecked(false);
    setStatusResult(null);

    try {
      const { data, error } = await (supabase as any)
        .from("school_registration_requests")
        .select("status, school_name, rejection_reason, requested_at, reviewed_at")
        .eq("email", statusEmail.trim().toLowerCase())
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setStatusResult(data || null);
      setStatusChecked(true);
    } catch (err: any) {
      toast.error("Failed to check status. Please try again.");
    } finally {
      setStatusLoading(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-2">Registration Submitted</h2>
                <p className="text-muted-foreground">
                  Thank you for registering <strong>{formData.school_name}</strong>. We've received your application.
                </p>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 p-4 text-left space-y-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">What happens next:</p>
                <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
                  <li>Our team will review your application</li>
                  <li>We'll send you an email with approval status</li>
                  <li>Once approved, you'll receive admin login credentials</li>
                  <li>You can then start setting up your school</li>
                </ol>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-600">
                    We'll review your application within <strong>24–48 hours</strong>. Check your email ({formData.email}) for updates.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep("form"); setActiveTab("status"); setStatusEmail(formData.email); }}
                  className="w-full"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Check Application Status
                </Button>
                <Button onClick={() => navigate("/")} className="w-full">
                  Return to Home
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4 py-12">
      <div className="w-full max-w-md space-y-4">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <GraduationCap className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold">Academia HQ</CardTitle>
            <CardDescription>School registration portal</CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "register" | "status")}>
              <TabsList className="w-full mb-6">
                <TabsTrigger value="register" className="flex-1">Register School</TabsTrigger>
                <TabsTrigger value="status"   className="flex-1">Check Status</TabsTrigger>
              </TabsList>

              {/* ── Registration Tab ── */}
              <TabsContent value="register">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="school_name">School Name <span className="text-destructive">*</span></Label>
                    <Input id="school_name" name="school_name" value={formData.school_name} onChange={handleChange} placeholder="e.g., Excellent Academy" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_person">Contact Person <span className="text-destructive">*</span></Label>
                    <Input id="contact_person" name="contact_person" value={formData.contact_person} onChange={handleChange} placeholder="e.g., John Doe" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="principal@school.com" required />
                    <p className="text-xs text-muted-foreground">We'll send approval updates to this email</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="+234-903-958-0317" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">School Address</Label>
                    <Input id="address" name="address" value={formData.address} onChange={handleChange} placeholder="123 Education Street, Lagos" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">School Website</Label>
                    <Input id="website" name="website" type="url" value={formData.website} onChange={handleChange} placeholder="https://yourschool.com" />
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                    <p><strong>Note:</strong> Your registration will be reviewed by our admin team within 24–48 hours.</p>
                    <p>Once approved, you'll receive login credentials to start configuring your school dashboard.</p>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full" size="lg">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit Registration"}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    By registering, you agree to our Terms of Service and Privacy Policy
                  </p>
                </form>
              </TabsContent>

              {/* ── Status Tab ── */}
              <TabsContent value="status">
                <form onSubmit={handleStatusCheck} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status-email">Email Address Used to Register</Label>
                    <Input
                      id="status-email"
                      type="email"
                      value={statusEmail}
                      onChange={e => setStatusEmail(e.target.value)}
                      placeholder="principal@school.com"
                      required
                    />
                  </div>

                  <Button type="submit" disabled={statusLoading} className="w-full">
                    {statusLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : <><Search className="mr-2 h-4 w-4" />Check Status</>}
                  </Button>
                </form>

                {statusChecked && (
                  <div className="mt-6">
                    {statusResult ? (
                      <StatusCard result={statusResult} />
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <p className="text-sm text-muted-foreground">No registration found for this email address.</p>
                        <Button variant="link" size="sm" className="mt-1" onClick={() => setActiveTab("register")}>
                          Submit a new registration
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Status result card ────────────────────────────────────────────────────────
function StatusCard({ result }: { result: StatusResult }) {
  const cfg = STATUS_CONFIG[result.status];
  const Icon = cfg.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{result.school_name}</h3>
        <Badge variant="outline" className={`gap-1.5 font-medium ${cfg.className}`}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Submitted: {new Date(result.requested_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}</p>
        {result.reviewed_at && (
          <p>Reviewed: {new Date(result.reviewed_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}</p>
        )}
      </div>

      {result.status === "pending" && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-3 flex gap-2">
          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-500">Your application is currently being reviewed. We'll notify you by email once a decision is made.</p>
        </div>
      )}

      {result.status === "approved" && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 p-3 flex gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700 dark:text-emerald-500">Your school has been approved! Check your email for login credentials.</p>
        </div>
      )}

      {result.status === "rejected" && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-3 flex gap-2">
          <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-400">
            <p className="font-medium mb-1">Application not approved.</p>
            {result.rejection_reason && <p>{result.rejection_reason}</p>}
            <p className="mt-1 text-xs opacity-80">Contact support if you believe this is an error.</p>
          </div>
        </div>
      )}
    </div>
  );
}
