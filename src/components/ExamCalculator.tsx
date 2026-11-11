// src/components/ExamCalculator.tsx
// A basic calculator, shown during a CBT exam only when the subject allows it
// (Subjects → "Allow Calculator in Exams"). No eval(): the maths is done by hand.
import { useState } from "react";
import { X } from "lucide-react";

type Op = "+" | "−" | "×" | "÷";

function clean(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  return String(parseFloat(n.toPrecision(12)));
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
  }
}

export default function ExamCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true); // next digit starts a new number

  const current = () => (display === "Error" ? 0 : parseFloat(display));

  const digit = (d: string) => {
    if (display === "Error") { setDisplay(d); setFresh(false); return; }
    if (fresh) { setDisplay(d === "." ? "0." : d); setFresh(false); return; }
    if (d === "." && display.includes(".")) return;
    if (display.replace(/[-.]/g, "").length >= 14) return;
    setDisplay(display === "0" && d !== "." ? d : display + d);
  };

  const operator = (next: Op) => {
    const cur = current();
    if (acc !== null && op && !fresh) {
      const r = apply(acc, cur, op);
      setAcc(Number.isFinite(r) ? r : null);
      setDisplay(clean(r));
    } else {
      setAcc(cur);
    }
    setOp(next);
    setFresh(true);
  };

  const equals = () => {
    if (acc === null || !op) return;
    const r = apply(acc, current(), op);
    setDisplay(clean(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => { setDisplay("0"); setAcc(null); setOp(null); setFresh(true); };
  const back = () => {
    if (fresh || display === "Error") return;
    setDisplay(display.length <= 1 || (display.length === 2 && display.startsWith("-")) ? "0" : display.slice(0, -1));
  };
  const negate = () => { if (display !== "0" && display !== "Error") setDisplay(display.startsWith("-") ? display.slice(1) : "-" + display); };
  const percent = () => { setDisplay(clean(current() / 100)); setFresh(true); };
  const sqrt = () => { const v = current(); setDisplay(v < 0 ? "Error" : clean(Math.sqrt(v))); setFresh(true); };
  const square = () => { const v = current(); setDisplay(clean(v * v)); setFresh(true); };

  const key = (label: string, onClick: () => void, extra = "") => (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-lg text-base font-medium transition active:scale-95 ${extra || "bg-muted hover:bg-muted/70"}`}
    >
      {label}
    </button>
  );
  const opKey = "bg-primary/10 text-primary hover:bg-primary/20";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[260px] rounded-2xl border bg-background p-3 shadow-2xl"
      role="dialog"
      aria-label="Calculator"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Calculator</span>
        <button type="button" onClick={onClose} aria-label="Close calculator" className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 flex h-14 items-end justify-end overflow-hidden rounded-lg bg-muted px-3 py-1">
        <span className="truncate text-right font-mono text-2xl" data-testid="calc-display">{display}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {key("C", clear, "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-300")}
        {key("⌫", back)}
        {key("%", percent)}
        {key("÷", () => operator("÷"), opKey)}
        {key("7", () => digit("7"))}{key("8", () => digit("8"))}{key("9", () => digit("9"))}
        {key("×", () => operator("×"), opKey)}
        {key("4", () => digit("4"))}{key("5", () => digit("5"))}{key("6", () => digit("6"))}
        {key("−", () => operator("−"), opKey)}
        {key("1", () => digit("1"))}{key("2", () => digit("2"))}{key("3", () => digit("3"))}
        {key("+", () => operator("+"), opKey)}
        {key("±", negate)}{key("0", () => digit("0"))}{key(".", () => digit("."))}
        {key("=", equals, "bg-primary text-primary-foreground hover:bg-primary/90")}
        {key("√", sqrt)}{key("x²", square)}
      </div>
    </div>
  );
}
