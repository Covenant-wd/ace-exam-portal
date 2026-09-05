import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, School, ShieldCheck, Users, Briefcase, CreditCard, ClipboardList, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const links = [
  { to: "/super-admin",                             label: "Schools",                  icon: School,          badgeKey: null              },
  { to: "/super-admin/registration-requests",       label: "Registration Requests",    icon: ClipboardCheck,  badgeKey: "registrations"   },
  { to: "/super-admin/subscriptions",               label: "Payment History",          icon: CreditCard,      badgeKey: null              },
  { to: "/super-admin/users",                       label: "All Users",                icon: Users,           badgeKey: null              },
  { to: "/super-admin/outreach-officers",           label: "Outreach Officers",        icon: Briefcase,       badgeKey: null              },
  { to: "/super-admin/implementation-requests",     label: "Implementation Requests",  icon: ClipboardList,   badgeKey: null              },
];

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);

  useEffect(() => {
    async function fetchPendingCount() {
      const { count } = await (supabase as any)
        .from("school_registration_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (count !== null) setPendingRegistrations(count);
    }
    fetchPendingCount();
    // Refresh every 60 seconds
    const interval = setInterval(fetchPendingCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  const badgeCounts: Record<string, number> = {
    registrations: pendingRegistrations,
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/super-admin/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Academia HQ</h1>
            <p className="text-xs opacity-80">Super Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {links.map((link) => {
            const active = location.pathname === link.to;
            const badgeCount = link.badgeKey ? (badgeCounts[link.badgeKey] ?? 0) : 0;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{link.label}</span>
                {badgeCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <p className="mb-2 truncate text-xs opacity-70">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b bg-card px-4 py-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
