import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendFeePaymentEmail } from "@/lib/email";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, DollarSign, Receipt, Trash2, Edit } from "lucide-react";

interface FeeType { id: string; name: string; amount: number; term_id: string | null; class_id: string | null; description: string; is_active: boolean; }
interface FeePayment { id: string; student_id: string; fee_type_id: string; amount_paid: number; payment_date: string; payment_method: string; receipt_number: string; notes: string; }
interface ClassItem { id: string; name: string; }
interface Term { id: string; name: string; }
interface StudentProfile { user_id: string; full_name: string; }

export default function Fees() {
  const { user, schoolId } = useAuth();
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [feeDialog, setFeeDialog] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeType | null>(null);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeTermId, setFeeTermId] = useState("");
  const [feeClassId, setFeeClassId] = useState("");
  const [feeDesc, setFeeDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [payDialog, setPayDialog] = useState(false);
  const [payStudent, setPayStudent] = useState("");
  const [payFeeType, setPayFeeType] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payReceipt, setPayReceipt] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const init = async () => {
      const [classRes, termRes, studentRes] = await Promise.all([
        supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("terms").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", "student"),
      ]);
      setClasses((classRes.data as ClassItem[]) || []);
      setTerms((termRes.data as Term[]) || []);

      // Only load profiles for actual students
      const studentIds = ((studentRes.data as any[]) || []).map((r: any) => r.user_id);
      if (studentIds.length > 0) {
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", studentIds)
          .order("full_name");
        setStudents((studentProfiles as StudentProfile[]) || []);
      } else {
        setStudents([]);
      }
      await loadFeeTypes(schoolId);
      await loadPayments(schoolId);
      setLoading(false);
    };
    init();
  }, [schoolId]);

  const loadFeeTypes = async (sid: string) => {
    const { data } = await supabase.from("fee_types").select("*").eq("school_id", sid).order("name");
    setFeeTypes((data as FeeType[]) || []);
  };

  const loadPayments = async (sid: string) => {
    const { data } = await supabase.from("fee_payments").select("*").eq("school_id", sid).order("created_at", { ascending: false }).limit(100);
    setPayments((data as FeePayment[]) || []);
  };

  const handleSaveFeeType = async () => {
    if (!feeName || !feeAmount || !schoolId) { toast.error("Name and amount required"); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: feeName, amount: parseFloat(feeAmount), school_id: schoolId, description: feeDesc,
        term_id: feeTermId || null, class_id: feeClassId || null,
      };
      if (editingFee) {
        const { error } = await supabase.from("fee_types").update(payload).eq("id", editingFee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fee_types").insert(payload);
        if (error) throw error;
      }
      toast.success(editingFee ? "Fee type updated" : "Fee type created");
      setFeeDialog(false);
      await loadFeeTypes(schoolId);
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleDeleteFeeType = async (id: string) => {
    if (!confirm("Delete this fee type?")) return;
    await supabase.from("fee_types").delete().eq("id", id);
    setFeeTypes(feeTypes.filter((f) => f.id !== id));
    toast.success("Fee type deleted");
  };

  const handleRecordPayment = async () => {
    if (!payStudent || !payFeeType || !payAmount || !schoolId || !user) { toast.error("All fields required"); return; }
    setPaySaving(true);
    try {
      const { error } = await supabase.from("fee_payments").insert({
        student_id: payStudent, fee_type_id: payFeeType, school_id: schoolId,
        amount_paid: parseFloat(payAmount), payment_method: payMethod,
        receipt_number: payReceipt, notes: payNotes, recorded_by: user.id,
      } as any);
      if (error) throw error;
      toast.success("Payment recorded");
      // Send fee payment email to student and parents
      try {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", payStudent).single();
        const { data: studentEmail } = await supabase.rpc("get_email_by_user_id", { _user_id: payStudent });
        const emails: string[] = [];
        if (studentEmail) emails.push(studentEmail);
        const { data: parentLinks } = await supabase.from("parent_students").select("parent_id").eq("student_id", payStudent);
        if (parentLinks && parentLinks.length > 0) {
          const parentIds = parentLinks.map((p: any) => p.parent_id);
          const { data: parentEmails } = await supabase.rpc("get_user_emails_by_ids", { _user_ids: parentIds });
          (parentEmails || []).forEach((r: any) => { if (r.email) emails.push(r.email); });
        }
        const feeName = feeTypes.find(f => f.id === payFeeType)?.name || "";
        if (emails.length > 0 && profile) {
          await sendFeePaymentEmail({
            to: emails,
            recipientName: profile.full_name,
            studentName: profile.full_name,
            schoolName: document.title || "School",
            feeName,
            amountPaid: parseFloat(payAmount),
            paymentDate: new Date().toISOString(),
            receiptNumber: payReceipt,
            loginUrl: window.location.origin,
          });
        }
      } catch {}
      setPayDialog(false);
      setPayStudent(""); setPayFeeType(""); setPayAmount(""); setPayReceipt(""); setPayNotes("");
      await loadPayments(schoolId);
    } catch (err: any) { toast.error(err.message); }
    setPaySaving(false);
  };

  const getStudentName = (id: string) => students.find((s) => s.user_id === id)?.full_name || id.slice(0, 8);
  const getFeeName = (id: string) => feeTypes.find((f) => f.id === id)?.name || "—";
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fee Management</h1>
        <p className="text-muted-foreground">Manage school fees and track payments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="flex items-center gap-4 p-6"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><DollarSign className="h-6 w-6 text-primary" /></div><div><p className="text-2xl font-bold">{feeTypes.length}</p><p className="text-sm text-muted-foreground">Fee Types</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-6"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30"><Receipt className="h-6 w-6 text-emerald-600" /></div><div><p className="text-2xl font-bold">{payments.length}</p><p className="text-sm text-muted-foreground">Payments</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-6"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30"><DollarSign className="h-6 w-6 text-emerald-600" /></div><div><p className="text-2xl font-bold">₦{totalCollected.toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Collected</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fee Types</CardTitle>
          <Button size="sm" onClick={() => { setEditingFee(null); setFeeName(""); setFeeAmount(""); setFeeTermId(""); setFeeClassId(""); setFeeDesc(""); setFeeDialog(true); }}><Plus className="mr-1 h-4 w-4" /> Add Fee Type</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {feeTypes.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No fee types configured</TableCell></TableRow>
              ) : (
                feeTypes.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>₦{Number(f.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{f.description || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingFee(f); setFeeName(f.name); setFeeAmount(String(f.amount)); setFeeTermId(f.term_id || ""); setFeeClassId(f.class_id || ""); setFeeDesc(f.description); setFeeDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteFeeType(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Payments</CardTitle>
          <Button size="sm" onClick={() => setPayDialog(true)}><Plus className="mr-1 h-4 w-4" /> Record Payment</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Fee</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Date</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No payments recorded</TableCell></TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{getStudentName(p.student_id)}</TableCell>
                    <TableCell>{getFeeName(p.fee_type_id)}</TableCell>
                    <TableCell>₦{Number(p.amount_paid).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="secondary">{p.payment_method}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground">{p.receipt_number || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={feeDialog} onOpenChange={setFeeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingFee ? "Edit Fee Type" : "Create Fee Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Fee Name</Label><Input value={feeName} onChange={(e) => setFeeName(e.target.value)} placeholder="e.g. Tuition Fee" /></div>
            <div className="space-y-2"><Label>Amount (₦)</Label><Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="0" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={feeDesc} onChange={(e) => setFeeDesc(e.target.value)} placeholder="Optional description" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Term (optional)</Label>
                <Select value={feeTermId} onValueChange={setFeeTermId}>
                  <SelectTrigger><SelectValue placeholder="All terms" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Terms</SelectItem>{terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class (optional)</Label>
                <Select value={feeClassId} onValueChange={setFeeClassId}>
                  <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Classes</SelectItem>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSaveFeeType} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingFee ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={payStudent} onValueChange={setPayStudent}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fee Type</Label>
              <Select value={payFeeType} onValueChange={(v) => { setPayFeeType(v); const fee = feeTypes.find((f) => f.id === v); if (fee) setPayAmount(String(fee.amount)); }}>
                <SelectTrigger><SelectValue placeholder="Select fee" /></SelectTrigger>
                <SelectContent>{feeTypes.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} (₦{Number(f.amount).toLocaleString()})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Amount Paid (₦)</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Receipt Number</Label><Input value={payReceipt} onChange={(e) => setPayReceipt(e.target.value)} placeholder="Optional" /></div>
            <Button onClick={handleRecordPayment} disabled={paySaving} className="w-full">{paySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Payment"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
