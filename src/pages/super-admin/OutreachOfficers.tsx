import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Briefcase, Trash2, Link2 } from "lucide-react";

interface Officer {
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
}

interface SchoolItem {
  id: string;
  name: string;
}

interface Referral {
  id: string;
  officer_id: string;
  school_id: string;
  commission_amount: number;
  commission_paid: boolean;
  created_at: string;
  schools?: { name: string } | null;
}

export default function OutreachOfficers() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  // Create officer dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Assign referral dialog
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load officers (users with outreach_officer role)
    const { data: usersData } = await supabase.rpc("get_all_school_users");
    const allUsers = (usersData as any[]) || [];
    const officerList = allUsers.filter((u: any) => u.role === "outreach_officer");
    setOfficers(officerList);

    // Load schools
    const { data: schoolData } = await supabase.from("schools").select("id, name").order("name");
    setSchools((schoolData as SchoolItem[]) || []);

    // Load all referrals
    const { data: refData } = await supabase.from("school_referrals").select("*, schools(name)").order("created_at", { ascending: false });
    setReferrals((refData as any[]) || []);

    setLoading(false);
  };

  const handleCreateOfficer = async () => {
    if (!fullName || !email || !password) return;
    setSaving(true);
    try {
      // Use create_school_user with no school_id (platform-level)
      const { data, error } = await supabase.rpc("create_school_user", {
        _email: email,
        _password: password,
        _full_name: fullName,
        _role: "outreach_officer",
        _school_id: "00000000-0000-0000-0000-000000000000",
      });
      if (error) throw error;
      toast.success("Outreach officer created");
      setCreateDialog(false);
      setFullName(""); setEmail(""); setPassword("");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleAssignReferral = async () => {
    if (!selectedOfficer || !selectedSchool || !commissionAmount) return;
    setAssigning(true);
    try {
      const { error } = await supabase.from("school_referrals").insert({
        officer_id: selectedOfficer,
        school_id: selectedSchool,
        commission_amount: parseFloat(commissionAmount),
      } as any);
      if (error) throw error;
      toast.success("Referral assigned");
      setAssignDialog(false);
      setSelectedOfficer(""); setSelectedSchool(""); setCommissionAmount("");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setAssigning(false);
  };

  const togglePaid = async (referral: Referral) => {
    await supabase.from("school_referrals").update({ commission_paid: !referral.commission_paid } as any).eq("id", referral.id);
    setReferrals(referrals.map(r => r.id === referral.id ? { ...r, commission_paid: !r.commission_paid } : r));
    toast.success(referral.commission_paid ? "Marked as unpaid" : "Marked as paid");
  };

  const handleDeleteOfficer = async (userId: string) => {
    if (!confirm("Delete this outreach officer?")) return;
    const { error } = await supabase.rpc("delete_school_user", { _user_id: userId });
    if (error) { toast.error(error.message); return; }
    toast.success("Officer deleted");
    loadData();
  };

  const getOfficerStats = (officerId: string) => {
    const officerRefs = referrals.filter(r => r.officer_id === officerId);
    const totalEarned = officerRefs.filter(r => r.commission_paid).reduce((s, r) => s + Number(r.commission_amount), 0);
    return { count: officerRefs.length, earned: totalEarned };
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Outreach Officers</h1>
          <p className="text-muted-foreground">Manage school outreach officers and referrals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAssignDialog(true)}>
            <Link2 className="mr-2 h-4 w-4" /> Assign Referral
          </Button>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Officer
          </Button>
        </div>
      </div>

      {/* Officers List */}
      <Card>
        <CardHeader><CardTitle>Officers</CardTitle></CardHeader>
        <CardContent className="p-0">
          {officers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Briefcase className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p>No outreach officers yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officers.map((o) => {
                  const stats = getOfficerStats(o.user_id);
                  return (
                    <TableRow key={o.user_id}>
                      <TableCell className="font-medium">{o.full_name}</TableCell>
                      <TableCell>{o.email}</TableCell>
                      <TableCell>{stats.count}</TableCell>
                      <TableCell>₦{stats.earned.toLocaleString()}</TableCell>
                      <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteOfficer(o.user_id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Referrals List */}
      <Card>
        <CardHeader><CardTitle>All Referrals</CardTitle></CardHeader>
        <CardContent className="p-0">
          {referrals.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No referrals yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Officer</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r) => {
                  const officer = officers.find(o => o.user_id === r.officer_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{officer?.full_name || r.officer_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{r.schools?.name || "Unknown"}</TableCell>
                      <TableCell>₦{Number(r.commission_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={r.commission_paid ? "default" : "secondary"}>
                          {r.commission_paid ? "Paid" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => togglePaid(r)}>
                          {r.commission_paid ? "Mark Unpaid" : "Mark Paid"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Officer Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Outreach Officer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button onClick={handleCreateOfficer} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Officer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Referral Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign School Referral</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Officer</Label>
              <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                <SelectTrigger><SelectValue placeholder="Select officer" /></SelectTrigger>
                <SelectContent>
                  {officers.map((o) => <SelectItem key={o.user_id} value={o.user_id}>{o.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>School</Label>
              <Select value={selectedSchool} onValueChange={setSelectedSchool}>
                <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
                <SelectContent>
                  {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Commission Amount (₦)</Label>
              <Input type="number" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} placeholder="0" />
            </div>
            <Button onClick={handleAssignReferral} disabled={assigning} className="w-full">
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Referral"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
