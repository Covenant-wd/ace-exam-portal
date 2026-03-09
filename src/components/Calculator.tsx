import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalculatorProps {
  onClose: () => void;
}

export default function Calculator({ onClose }: CalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  const input = (val: string) => {
    if (reset) { setDisplay(val); setReset(false); return; }
    setDisplay(display === "0" ? val : display + val);
  };

  const decimal = () => {
    if (reset) { setDisplay("0."); setReset(false); return; }
    if (!display.includes(".")) setDisplay(display + ".");
  };

  const clear = () => { setDisplay("0"); setPrev(null); setOp(null); setReset(false); };

  const operate = (nextOp: string) => {
    const current = parseFloat(display);
    if (prev !== null && op) {
      let result = prev;
      if (op === "+") result = prev + current;
      else if (op === "-") result = prev - current;
      else if (op === "×") result = prev * current;
      else if (op === "÷") result = current !== 0 ? prev / current : 0;
      setDisplay(String(parseFloat(result.toFixed(10))));
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setReset(true);
  };

  const equals = () => {
    if (prev === null || !op) return;
    const current = parseFloat(display);
    let result = prev;
    if (op === "+") result = prev + current;
    else if (op === "-") result = prev - current;
    else if (op === "×") result = prev * current;
    else if (op === "÷") result = current !== 0 ? prev / current : 0;
    setDisplay(String(parseFloat(result.toFixed(10))));
    setPrev(null);
    setOp(null);
    setReset(true);
  };

  const toggleSign = () => {
    setDisplay(String(parseFloat(display) * -1));
  };

  const percent = () => {
    setDisplay(String(parseFloat(display) / 100));
  };

  const btnClass = "h-12 text-lg font-semibold rounded-xl transition-colors";

  return (
    <Card className="w-72 shadow-2xl border-2 border-border">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">Calculator</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="mb-3 rounded-xl bg-muted px-4 py-3 text-right">
          <div className="text-xs text-muted-foreground h-4">
            {prev !== null && op ? `${prev} ${op}` : ""}
          </div>
          <div className="text-2xl font-bold text-foreground truncate">{display}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="secondary" className={btnClass} onClick={clear}>C</Button>
          <Button variant="secondary" className={btnClass} onClick={toggleSign}>±</Button>
          <Button variant="secondary" className={btnClass} onClick={percent}>%</Button>
          <Button variant="outline" className={cn(btnClass, op === "÷" && "bg-primary text-primary-foreground")} onClick={() => operate("÷")}>÷</Button>

          {["7","8","9"].map(n => <Button key={n} variant="ghost" className={cn(btnClass, "bg-card hover:bg-muted")} onClick={() => input(n)}>{n}</Button>)}
          <Button variant="outline" className={cn(btnClass, op === "×" && "bg-primary text-primary-foreground")} onClick={() => operate("×")}>×</Button>

          {["4","5","6"].map(n => <Button key={n} variant="ghost" className={cn(btnClass, "bg-card hover:bg-muted")} onClick={() => input(n)}>{n}</Button>)}
          <Button variant="outline" className={cn(btnClass, op === "-" && "bg-primary text-primary-foreground")} onClick={() => operate("-")}>−</Button>

          {["1","2","3"].map(n => <Button key={n} variant="ghost" className={cn(btnClass, "bg-card hover:bg-muted")} onClick={() => input(n)}>{n}</Button>)}
          <Button variant="outline" className={cn(btnClass, op === "+" && "bg-primary text-primary-foreground")} onClick={() => operate("+")}>+</Button>

          <Button variant="ghost" className={cn(btnClass, "col-span-2 bg-card hover:bg-muted")} onClick={() => input("0")}>0</Button>
          <Button variant="ghost" className={cn(btnClass, "bg-card hover:bg-muted")} onClick={decimal}>.</Button>
          <Button className={cn(btnClass, "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={equals}>=</Button>
        </div>
      </CardContent>
    </Card>
  );
}
