import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { GraduationCap, Loader2, UserRound } from "lucide-react";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";

export default function StudentLogin() {
  const { user, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { schoolName } = useSchoolName();
  const { logoUrl } = useSchoolLogo();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    } else {
      if (!fullName.trim()) {
        toast.error("Please enter your full name");
        setSubmitting(false);
        return;
      }
      const { error } = await signUp(email, password, fullName, className);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Account created! You can now sign in.");
        setIsLogin(true);
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            ) : (
              <GraduationCap className="h-8 w-8" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">{schoolName}</CardTitle>
          <CardDescription className="flex items-center justify-center gap-2">
            <UserRound className="h-4 w-4" />
            {isLogin ? "Student Sign In" : "Student Sign Up"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-email">Email</Label>
                <Input id="student-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@school.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-password">Password</Label>
                <Input id="student-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="className">Class / Grade</Label>
                <Input id="className" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. SS3, Grade 12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Are you an admin?{" "}
            <Link to="/auth/admin" className="text-primary font-medium hover:underline">
              Admin Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
