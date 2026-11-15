// src/components/InAppCbtGate.tsx
// Wraps every built-in CBT screen. If the school has not turned the built-in CBT on
// (for example because it prefers its external CBT portal) the screen explains that
// instead of showing exam pages that nobody has set up.
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useInAppCbt } from "@/hooks/useInAppCbt";

export default function InAppCbtGate({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { enabled, isLoading, cbtLink } = useInAppCbt();

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (enabled) return <>{children}</>;

  return (
    <Card className="mx-auto max-w-xl border-0 shadow-md">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="font-semibold">Built-in CBT exams are not switched on for your school.</p>
        <p className="text-sm text-muted-foreground">
          {role === "admin"
            ? "You can switch them on in Settings → Built-in CBT Exams."
            : "Please ask your school admin if you expected to see exams here."}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {role === "admin" && (
            <Button asChild><Link to="/admin/settings">Open Settings</Link></Button>
          )}
          {cbtLink && (
            <Button asChild variant="outline">
              <a href={cbtLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />Open CBT Portal
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
