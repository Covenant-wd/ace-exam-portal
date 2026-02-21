import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image, FunctionSquare, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

const MATH_SYMBOLS = [
  { label: "±", insert: "±" },
  { label: "×", insert: "×" },
  { label: "÷", insert: "÷" },
  { label: "≠", insert: "≠" },
  { label: "≤", insert: "≤" },
  { label: "≥", insert: "≥" },
  { label: "∞", insert: "∞" },
  { label: "√", insert: "√" },
  { label: "∑", insert: "∑" },
  { label: "∏", insert: "∏" },
  { label: "∫", insert: "∫" },
  { label: "∂", insert: "∂" },
  { label: "Δ", insert: "Δ" },
  { label: "π", insert: "π" },
  { label: "θ", insert: "θ" },
  { label: "α", insert: "α" },
  { label: "β", insert: "β" },
  { label: "γ", insert: "γ" },
  { label: "λ", insert: "λ" },
  { label: "μ", insert: "μ" },
  { label: "σ", insert: "σ" },
  { label: "φ", insert: "φ" },
  { label: "ω", insert: "ω" },
  { label: "°", insert: "°" },
  { label: "²", insert: "²" },
  { label: "³", insert: "³" },
  { label: "⁴", insert: "⁴" },
  { label: "₁", insert: "₁" },
  { label: "₂", insert: "₂" },
  { label: "₃", insert: "₃" },
  { label: "→", insert: "→" },
  { label: "⇌", insert: "⇌" },
  { label: "∈", insert: "∈" },
  { label: "∉", insert: "∉" },
  { label: "⊂", insert: "⊂" },
  { label: "∪", insert: "∪" },
  { label: "∩", insert: "∩" },
  { label: "∠", insert: "∠" },
  { label: "⊥", insert: "⊥" },
  { label: "∥", insert: "∥" },
  { label: "△", insert: "△" },
];

const PHONICS_SYMBOLS = [
  { label: "ə", insert: "ə" },
  { label: "ɪ", insert: "ɪ" },
  { label: "ʊ", insert: "ʊ" },
  { label: "æ", insert: "æ" },
  { label: "ɑ", insert: "ɑ" },
  { label: "ɒ", insert: "ɒ" },
  { label: "ɔ", insert: "ɔ" },
  { label: "ɛ", insert: "ɛ" },
  { label: "ʌ", insert: "ʌ" },
  { label: "ð", insert: "ð" },
  { label: "θ", insert: "θ" },
  { label: "ʃ", insert: "ʃ" },
  { label: "ʒ", insert: "ʒ" },
  { label: "ŋ", insert: "ŋ" },
  { label: "tʃ", insert: "tʃ" },
  { label: "dʒ", insert: "dʒ" },
  { label: "ɹ", insert: "ɹ" },
  { label: "ˈ", insert: "ˈ" },
  { label: "ˌ", insert: "ˌ" },
  { label: "ː", insert: "ː" },
];

const LATEX_TEMPLATES = [
  { label: "Fraction", insert: "$$\\frac{a}{b}$$" },
  { label: "Square root", insert: "$$\\sqrt{x}$$" },
  { label: "Nth root", insert: "$$\\sqrt[n]{x}$$" },
  { label: "Power", insert: "$$x^{n}$$" },
  { label: "Subscript", insert: "$$x_{n}$$" },
  { label: "Summation", insert: "$$\\sum_{i=1}^{n} x_i$$" },
  { label: "Integral", insert: "$$\\int_{a}^{b} f(x)\\,dx$$" },
  { label: "Limit", insert: "$$\\lim_{x \\to \\infty}$$" },
  { label: "Log", insert: "$$\\log_{b}(x)$$" },
  { label: "Sin/Cos", insert: "$$\\sin(\\theta)$$" },
  { label: "Matrix 2×2", insert: "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$" },
  { label: "Abs value", insert: "$$|x|$$" },
  { label: "Angle", insert: "$$\\angle ABC$$" },
  { label: "Degrees", insert: "$$90^{\\circ}$$" },
  { label: "Parallel", insert: "$$AB \\parallel CD$$" },
  { label: "Perp.", insert: "$$AB \\perp CD$$" },
  { label: "Pi", insert: "$$\\pi$$" },
  { label: "Infinity", insert: "$$\\infty$$" },
  { label: "Not equal", insert: "$$\\neq$$" },
  { label: "Approx", insert: "$$\\approx$$" },
];

export default function RichTextEditor({ value, onChange, placeholder, rows = 3 }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.substring(0, start) + text + value.substring(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    }, 0);
  }, [value, onChange]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("question-images").upload(path, file);
    if (error) { toast.error("Upload failed"); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
    insertAtCursor(`![diagram](${urlData.publicUrl})`);
    toast.success("Image uploaded");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {/* Math symbols */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              π ∑ Math
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">Math & Science Symbols</p>
            <div className="grid grid-cols-8 gap-1">
              {MATH_SYMBOLS.map((s) => (
                <button key={s.label} type="button" onClick={() => insertAtCursor(s.insert)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-border text-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Phonics */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              ə ʃ Phonics
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">IPA / Phonics Symbols</p>
            <div className="grid grid-cols-8 gap-1">
              {PHONICS_SYMBOLS.map((s) => (
                <button key={s.label + s.insert} type="button" onClick={() => insertAtCursor(s.insert)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-border text-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* LaTeX formulas */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              <FunctionSquare className="mr-1 h-3.5 w-3.5" /> Formula
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">LaTeX Formulas (click to insert)</p>
            <div className="space-y-1">
              {LATEX_TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => insertAtCursor(t.insert)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Image upload */}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Image className="mr-1 h-3.5 w-3.5" />}
          Diagram
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      <p className="text-[11px] text-muted-foreground">
        Use <code className="rounded bg-muted px-1">$$formula$$</code> for math formulas (LaTeX). Use <code className="rounded bg-muted px-1">![alt](url)</code> for images.
      </p>
    </div>
  );
}
