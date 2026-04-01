import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, School, DollarSign, Clock } from "lucide-react";

export default function OutreachDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSchools: 0, totalEarned: 0, pendingPayout: 0 });
  const [recentReferrals, setRecentReferrals] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("school_referrals")
        .select("*, schools(name)")
        .eq("officer_id", user.id)
        .order("created_at", { ascending: false });

      const referrals = (data as any[]) || [];
      const totalEarned = referrals.filter(r => r.commission_paid).reduce((s, r) => s + Number(r.commission_amount), 0);
      const pendingPayout = referrals.filter(r => !r.commission_paid).reduce((s, r) => s + Number(r.commission_amount), 0);

      setStats({ totalSchools: referrals.length, totalEarned, pendingPayout });
      setRecentReferrals(referrals.slice(0, 5));
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your outreach overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Schools Referred</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalSchools}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">₦{stats.totalEarned.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">₦{stats.pendingPayout.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Referrals</CardTitle></CardHeader>
        <CardContent>
          {recentReferrals.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No referrals yet</p>
          ) : (
            <div className="space-y-3">
              {recentReferrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{r.schools?.name || "Unknown School"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">₦{Number(r.commission_amount).toLocaleString()}</p>
                    <p className={`text-xs ${r.commission_paid ? "text-green-600" : "text-amber-600"}`}>
                      {r.commission_paid ? "Paid" : "Pending"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
