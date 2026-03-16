import { useState, useEffect } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap, Loader2, ShieldCheck, Users, Zap } from "lucide-react";

interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
}

export default function SchoolLogin() {
  const { slug } = useParams<{ slug: string }>();
  const { user, role, loading: authLoading, signIn } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form states
  const [loginTab, setLoginTab] = useState("student");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchSchool = async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error || !data) {
        setNotFound(true);
      } else {
        setSchool(data as School);
      }
      setLoadingSchool(false);
    };
    if (slug) fetchSchool();
  }, [slug]);

  if (loadingSchool || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <GraduationCap className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">School Not Found</h1>
        <p className="text-muted-foreground">The school "{slug}" doesn't exist.</p>
        <Button asChild variant="outline">
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    );
  }

  if (user) {
    if (role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "instructor") return <Navigate to="/instructor" replace />;
    return <Navigate to="/student" replace />;
  }

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Use SECURITY DEFINER function - works without authentication
      const { data: emailData, error: emailError } = await supabase
        .rpc("get_email_by_username", {
          _username: username.trim(),
          _school_id: school!.id,
        });

      if (emailError || !emailData) {
        toast.error("Username not found. Please check and try again.");
        setSubmitting(false);
        return;
      }

      const { error } = await signIn(emailData, password);
      if (error) toast.error("Incorrect password. Please try again.");
    } catch {
      toast.error("Login failed. Please try again.");
    }
    setSubmitting(false);
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg overflow-hidden">
            {school?.logo_url ? (
              <img src={school.logo_url} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <GraduationCap className="h-8 w-8" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">{school?.name}</CardTitle>
          <CardDescription className="flex items-center justify-center gap-2 text-xs">
            <Zap className="h-3 w-3" /> Powered by Academia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={loginTab} onValueChange={setLoginTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Student
              </TabsTrigger>
              <TabsTrigger value="staff" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Staff
              </TabsTrigger>
            </TabsList>

            <TabsContent value="student">
              <form onSubmit={handleStudentSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Student Sign In"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground text-xs">
                Contact your school admin if you don't have an account.
              </p>
            </TabsContent>

            <TabsContent value="staff">
              <form onSubmit={handleStaffSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.com" required />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Staff Sign In"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground text-xs">
                Contact your school admin if you don't have an account.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
