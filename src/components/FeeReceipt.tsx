// src/components/FeeReceipt.tsx
// Printable fee receipt: school name + logo, fee type, amount (figures and words),
// a unique reference number, a QR code that opens the public authenticity check,
// and space for the school stamp and an authorised signature.
import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { amountToWords } from "@/lib/numberToWords";

export interface ReceiptData {
  /** System-generated reference, e.g. AHS-7K3M-9Q2X */
  reference: string;
  schoolName: string;
  logoUrl?: string;
  studentName: string;
  className?: string;
  feeName: string;
  amount: number;
  paymentMethod?: string;
  /** YYYY-MM-DD */
  paymentDate: string;
  /** Optional teller / bank reference typed in when the payment was recorded */
  tellerNumber?: string;
  notes?: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  other: "Other",
};

function methodLabel(m?: string) {
  if (!m) return "—";
  return METHOD_LABELS[m] || m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");
}

function formatDate(date: string) {
  // Parse YYYY-MM-DD by hand so the day never shifts with the viewer's time zone.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || "");
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  if (isNaN(d.getTime())) return date || "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function formatMoney(n: number) {
  return `₦${(Number(n) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function verifyUrlFor(reference: string) {
  return `${window.location.origin}/verify-receipt/${encodeURIComponent(reference)}`;
}

// Self-contained styles (the print window has no access to the app's Tailwind CSS).
const RECEIPT_CSS = `
.rcpt{font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff;border:2px solid #1f2937;
  padding:22px 26px;max-width:760px;margin:0 auto;box-sizing:border-box;line-height:1.35}
.rcpt *{box-sizing:border-box}
.rcpt-head{display:flex;align-items:center;gap:16px;border-bottom:2px solid #1f2937;padding-bottom:14px}
.rcpt-logo{width:72px;height:72px;object-fit:contain;flex:none}
.rcpt-school{flex:1;text-align:center}
.rcpt-school h1{margin:0;font-size:22px;letter-spacing:.5px;text-transform:uppercase}
.rcpt-school p{margin:4px 0 0;font-size:13px;letter-spacing:2px;color:#374151;text-transform:uppercase}
.rcpt-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0;font-size:14px}
.rcpt-meta b{font-family:'Courier New',monospace;font-size:15px}
.rcpt-table{width:100%;border-collapse:collapse;font-size:14px}
.rcpt-table th,.rcpt-table td{border:1px solid #9ca3af;padding:8px 10px;text-align:left;vertical-align:top}
.rcpt-table th{width:34%;background:#f3f4f6;font-weight:600}
.rcpt-amount{margin:16px 0 6px;border:2px solid #1f2937;padding:12px 14px;display:flex;justify-content:space-between;
  align-items:center;gap:10px;flex-wrap:wrap}
.rcpt-amount span{font-size:13px;text-transform:uppercase;letter-spacing:1px}
.rcpt-amount strong{font-family:Arial,Helvetica,sans-serif;font-size:26px}
.rcpt-words{font-size:14px;margin:8px 0 0}
.rcpt-words i{font-weight:700}
.rcpt-foot{display:flex;align-items:stretch;flex-wrap:wrap;margin-top:22px;gap:14px}
.rcpt-qr{display:flex;gap:10px;align-items:center;flex:1 1 270px;min-width:0}
.rcpt-qr svg{flex:none;border:1px solid #d1d5db;padding:4px;background:#fff}
.rcpt-qr div{min-width:0}
.rcpt-qr small{display:block;font-size:11px;color:#374151;overflow-wrap:anywhere;word-break:break-all}
.rcpt-qr strong{display:block;font-size:12px;margin-bottom:3px}
.rcpt-stamp{flex:0 0 150px;min-height:96px;border:2px dashed #6b7280;display:flex;align-items:flex-end;justify-content:center;
  padding:6px;font-size:11px;color:#6b7280;text-align:center}
.rcpt-sign{flex:1 1 190px;min-width:160px;display:flex;flex-direction:column;justify-content:flex-end;margin-left:6px}
.rcpt-sign div{border-top:1px solid #111;padding-top:4px;font-size:11px;color:#374151;text-align:center}
.rcpt-note{margin-top:16px;border-top:1px solid #d1d5db;padding-top:8px;font-size:11px;color:#4b5563;text-align:center}
`;

/** The receipt itself — used for both the on-screen preview and the print window. */
export function ReceiptSheet({ data }: { data: ReceiptData }) {
  const url = verifyUrlFor(data.reference);
  return (
    <div className="rcpt">
      <div className="rcpt-head">
        {data.logoUrl ? <img className="rcpt-logo" src={data.logoUrl} alt="School logo" /> : null}
        <div className="rcpt-school">
          <h1>{data.schoolName}</h1>
          <p>Official Fee Receipt</p>
        </div>
      </div>

      <div className="rcpt-meta">
        <div>Receipt No: <b>{data.reference}</b></div>
        <div>Date: <b style={{ fontFamily: "inherit" }}>{formatDate(data.paymentDate)}</b></div>
      </div>

      <table className="rcpt-table">
        <tbody>
          <tr><th>Received from</th><td>{data.studentName}</td></tr>
          {data.className ? <tr><th>Class</th><td>{data.className}</td></tr> : null}
          <tr><th>Fee type</th><td>{data.feeName}</td></tr>
          <tr><th>Payment method</th><td>{methodLabel(data.paymentMethod)}</td></tr>
          {data.tellerNumber ? <tr><th>Teller / payment ref</th><td>{data.tellerNumber}</td></tr> : null}
          {data.notes ? <tr><th>Notes</th><td>{data.notes}</td></tr> : null}
        </tbody>
      </table>

      <div className="rcpt-amount">
        <span>Amount paid</span>
        <strong>{formatMoney(data.amount)}</strong>
      </div>
      <p className="rcpt-words">Amount in words: <i>{amountToWords(data.amount)}</i></p>

      <div className="rcpt-foot">
        <div className="rcpt-qr">
          <QRCodeSVG value={url} size={92} level="M" marginSize={0} />
          <div>
            <strong>Scan to verify authenticity</strong>
            <small>{url}</small>
          </div>
        </div>
        <div className="rcpt-stamp">School stamp (if required)</div>
        <div className="rcpt-sign"><div>Authorised signature (if required)</div></div>
      </div>

      <div className="rcpt-note">
        This receipt is genuine only if the QR code or receipt number above is confirmed on the school&apos;s verification page.
      </div>
    </div>
  );
}

/**
 * Opens the browser's print dialog for a clean, receipt-only page.
 * `body` is the receipt's own markup (taken from the receipt shown on screen).
 */
function printReceiptHtml(body: string, reference: string) {
  const printScript =
    '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});<\/script>';
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Receipt ${reference}</title>` +
    `<style>${RECEIPT_CSS}@page{size:A4;margin:12mm}html,body{margin:0;padding:12px;background:#fff}` +
    `@media print{html,body{padding:0}.rcpt{border-width:2px}}</style></head><body>${body}${printScript}</body></html>`;

  // Must run directly inside the click handler so pop-up blockers allow it.
  const w = window.open("", "_blank");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }

  // Fallback if pop-ups are blocked: print from a hidden frame.
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => frame.remove(), 60_000);
}

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
  /** e.g. "Payment recorded" — shown above the receipt right after a payment is saved */
  title?: string;
}

export function FeeReceiptDialog({ open, onOpenChange, data, title = "Payment Receipt" }: ReceiptDialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!data || !sheetRef.current) return;
    printReceiptHtml(sheetRef.current.innerHTML, data.reference);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {data && (
          <>
            <style>{RECEIPT_CSS}</style>
            <div className="overflow-x-auto" ref={sheetRef}>
              <ReceiptSheet data={data} />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />Print Receipt
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
