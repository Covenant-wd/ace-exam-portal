// src/pages/VerifyReceipt.tsx
// Public page opened by the QR code on a printed fee receipt. No login needed.
// It shows what the school's records hold for that receipt reference, so anyone
// can compare it with the paper in their hand.
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { amountToWords } from "@/lib/numberToWords";

interface VerifiedReceipt {
  valid: boolean;
  receipt_ref?: string;
  school_name?: string;
  school_logo_url?: string;
  student_name?: string | null;
  fee_name?: string | null;
  amount_paid?: number;
  payment_method?: string;
  payment_date?: string;
  recorded_at?: string;
}

function formatDate(date?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || "");
  if (!m) return date || "—";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function methodLabel(m?: string) {
  if (!m) return "—";
  return m.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function VerifyReceipt() {
  const { ref = "" } = useParams<{ ref: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifiedReceipt | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    (supabase as any)
      .rpc("verify_receipt", { _reference: ref })
      .then(({ data, error }: any) => {
        if (!alive) return;
        if (error) { setFailed(true); setResult(null); }
        else setResult((data as VerifiedReceipt) || { valid: false });
        setLoading(false);
      });
    return () => { alive = false; };
  }, [ref]);

  const rows: [string, string][] = result?.valid
    ? [
        ["Receipt number", result.receipt_ref || ref],
        ["Student", result.student_name || "—"],
        ["Fee type", result.fee_name || "—"],
        ["Amount paid", `₦${Number(result.amount_paid || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ["Amount in words", amountToWords(Number(result.amount_paid || 0))],
        ["Payment method", methodLabel(result.payment_method)],
        ["Payment date", formatDate(result.payment_date)],
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#f5f5f7] px-4 py-8 dark:bg-[#0f0f14]">
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-center text-xl font-bold">Receipt Verification</h1>

        <Card>
          <CardContent className="space-y-5 p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Checking receipt…
              </div>
            ) : failed ? (
              <div className="py-6 text-center">
                <ShieldX className="mx-auto mb-2 h-12 w-12 text-amber-500" />
                <p className="font-semibold">We couldn&apos;t check this receipt right now.</p>
                <p className="mt-1 text-sm text-muted-foreground">Please check your connection and try again.</p>
              </div>
            ) : result?.valid ? (
              <>
                <div className="text-center">
                  <ShieldCheck className="mx-auto mb-2 h-14 w-14 text-emerald-600" />
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Authentic receipt</p>
                  <p className="text-sm text-muted-foreground">
                    This receipt was issued by the school below. Compare the details with your copy.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 border-y py-4">
                  {result.school_logo_url ? (
                    <img src={result.school_logo_url} alt="" className="h-12 w-12 object-contain" />
                  ) : null}
                  <p className="text-center text-lg font-semibold uppercase tracking-wide">{result.school_name}</p>
                </div>

                <dl className="divide-y text-sm">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="text-xs text-muted-foreground">
                  If any detail here differs from the paper receipt, treat the paper receipt as invalid and contact the school.
                </p>
              </>
            ) : (
              <div className="py-6 text-center">
                <ShieldX className="mx-auto mb-2 h-14 w-14 text-red-600" />
                <p className="text-lg font-bold text-red-700 dark:text-red-400">Receipt not found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No receipt with the number <span className="font-mono font-semibold">{ref || "—"}</span> exists in the
                  school&apos;s records. This receipt may be fake or the number may have been copied wrongly.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
