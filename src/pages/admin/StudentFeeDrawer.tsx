import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, AlertCircle, Clock, Receipt } from "lucide-react";

interface FeeLineItem {
  fee_type_id: string;
  fee_name: string;
  fee_amount: number;
  amount_paid: number;
  balance: number;
  payment_count: number;
}

interface PaymentRecord {
  id: string;
  fee_type_id: string;
  fee_name: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  receipt_number: string;
  notes: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  schoolId: string;
  termId?: string | null;
  onRecordPayment?: (studentId: string) => void;
}

const methodLabel: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  other: "Other",
};

export default function StudentFeeDrawer({
  open, onClose, studentId, studentName, schoolId, termId, onRecordPayment,
}: Props) {
  const [lines, setLines] = useState<FeeLineItem[]>([]);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId || !schoolId) return;
    setLoading(true);
    const load = async () => {
      const [summaryRes, historyRes] = await Promise.all([
        supabase.rpc("get_student_fee_summary", {
          _student_id: studentId,
          _school_id:  schoolId,
          _term_id:    termId ?? null,
        } as any),
        supabase.rpc("get_student_payment_history", {
          _student_id: studentId,
          _school_id:  schoolId,
        } as any),
      ]);
      setLines((summaryRes.data as FeeLineItem[]) ?? []);
      setHistory((historyRes.data as PaymentRecord[]) ?? []);
      setLoading(false);
    };
    load();
  }, [open, studentId, schoolId, termId]);

  const totalFees  = lines.reduce((s, l) => s + Number(l.fee_amount), 0);
  const totalPaid  = lines.reduce((s, l) => s + Number(l.amount_paid), 0);
  const balance    = totalFees - totalPaid;
  const pctPaid    = totalFees > 0 ? Math.min(100, Math.round((totalPaid / totalFees) * 100)) : 0;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl">{studentName}</SheetTitle>
          <p className="text-sm text-muted-foreground">Fee summary &amp; payment history</p>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Fees",   value: totalFees, color: "text-foreground" },
                { label: "Total Paid",   value: totalPaid, color: "text-emerald-600" },
                { label: "Balance",      value: balance,   color: balance > 0 ? "text-red-600" : "text-emerald-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className={`text-lg font-bold ${color}`}>₦{Number(value).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {totalFees > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pctPaid}% paid</span>
                  <span>{balance > 0 ? `₦${Number(balance).toLocaleString()} remaining` : "Fully paid"}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pctPaid >= 100 ? "bg-emerald-500" : pctPaid > 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${pctPaid}%` }}
                  />
                </div>
              </div>
            )}

            {/* Fee breakdown */}
            <div>
              <p className="text-sm font-semibold mb-2">Fee Breakdown</p>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No fees assigned for this period</p>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => (
                        <TableRow key={l.fee_type_id}>
                          <TableCell className="font-medium text-sm">
                            <div className="flex items-center gap-1.5">
                              {Number(l.balance) <= 0
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                : Number(l.amount_paid) > 0
                                  ? <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  : <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              }
                              {l.fee_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">₦{Number(l.fee_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">₦{Number(l.amount_paid).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">
                            <span className={Number(l.balance) > 0 ? "text-red-600 font-medium" : "text-emerald-600"}>
                              {Number(l.balance) > 0 ? `₦${Number(l.balance).toLocaleString()}` : "✓"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {onRecordPayment && (
              <button
                onClick={() => onRecordPayment(studentId)}
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Record Payment
              </button>
            )}

            <Separator />

            {/* Payment history */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Payment History</p>
                {history.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{history.length}</Badge>
                )}
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No payments recorded</p>
              ) : (
                <div className="space-y-2">
                  {history.map((p) => (
                    <div key={p.id} className="flex items-start justify-between rounded-xl border p-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="font-medium">{p.fee_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.payment_date).toLocaleDateString()} · {methodLabel[p.payment_method] ?? p.payment_method}
                          {p.receipt_number && ` · #${p.receipt_number}`}
                        </p>
                        {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                      </div>
                      <span className="text-emerald-600 font-semibold shrink-0 ml-3">
                        ₦{Number(p.amount_paid).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
