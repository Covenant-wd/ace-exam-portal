import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, School } from "lucide-react";

export default function OutreachSchools() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("school_referrals")
        .select("*, schools(name, slug, created_at)")
        .eq("officer_id", user.id)
        .order("created_at", { ascending: false });
      setReferrals((data as any[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Referred Schools</h1>
        <p className="text-muted-foreground">Schools you've referred to Academia</p>
      </div>

      {referrals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <School className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>No referred schools yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School Name</TableHead>
                  <TableHead>Referred Date</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.schools?.name || "Unknown"}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>₦{Number(r.commission_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={r.commission_paid ? "default" : "secondary"}>
                        {r.commission_paid ? "Paid" : "Pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
