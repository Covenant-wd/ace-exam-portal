// src/components/TheoryPaper.tsx
// A theory question paper (answered on paper): school header, exam details,
// instructions and the numbered questions with their marks. Used by teachers
// (to check and print the paper) and by students (to read it when the exam is open).
import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TheoryQuestion } from "@/lib/exams";

export interface TheoryPaperData {
  title: string;
  subjectName?: string | null;
  className?: string | null;
  durationMinutes: number;
  instructions?: string | null;
  schoolName?: string;
  logoUrl?: string;
  questions: TheoryQuestion[];
}

// Self-contained styles: the print window cannot see the app's Tailwind CSS.
const PAPER_CSS = `
.tp{font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff;max-width:820px;margin:0 auto;padding:24px 28px;
  border:1px solid #d1d5db;line-height:1.5;box-sizing:border-box}
.tp *{box-sizing:border-box}
.tp-head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:12px}
.tp-logo{width:60px;height:60px;object-fit:contain;flex:none}
.tp-school{flex:1;text-align:center}
.tp-school h1{margin:0;font-size:20px;text-transform:uppercase;letter-spacing:.5px}
.tp-school p{margin:3px 0 0;font-size:14px;font-weight:700}
.tp-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;font-size:13px;margin-bottom:10px}
.tp-instr{border:1px solid #9ca3af;padding:8px 12px;font-size:13px;margin-bottom:14px;white-space:pre-wrap}
.tp-q{display:flex;gap:10px;margin:0 0 12px;font-size:15px;page-break-inside:avoid}
.tp-no{flex:none;min-width:38px;font-weight:700}
.tp-body{flex:1;white-space:pre-wrap;overflow-wrap:anywhere}
.tp-marks{flex:none;font-size:12px;color:#374151;white-space:nowrap;padding-left:8px}
.tp-sub{margin-left:0}
.tp-foot{margin-top:16px;border-top:1px solid #9ca3af;padding-top:8px;text-align:center;font-size:12px;color:#4b5563}
`;

function totalMarks(qs: TheoryQuestion[]) {
  return qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
}

export function TheoryPaper({ data }: { data: TheoryPaperData }) {
  const sorted = [...data.questions].sort((a, b) => a.question_order - b.question_order);
  let lastNumber = "";
  return (
    <div className="tp">
      <div className="tp-head">
        {data.logoUrl ? <img className="tp-logo" src={data.logoUrl} alt="" /> : null}
        <div className="tp-school">
          {data.schoolName ? <h1>{data.schoolName}</h1> : null}
          <p>{data.title}</p>
        </div>
      </div>
      <div className="tp-meta">
        <span>Subject: <b>{data.subjectName || "—"}</b></span>
        {data.className ? <span>Class: <b>{data.className}</b></span> : null}
        <span>Time allowed: <b>{data.durationMinutes} minutes</b></span>
        <span>Total marks: <b>{totalMarks(sorted)}</b></span>
      </div>
      {data.instructions ? <div className="tp-instr"><b>Instructions:</b> {data.instructions}</div> : null}

      {sorted.map((q) => {
        const showNumber = q.question_number !== lastNumber;
        lastNumber = q.question_number;
        return (
          <div className="tp-q" key={q.id}>
            <span className="tp-no">{showNumber ? `${q.question_number}.` : ""}</span>
            <span className="tp-body">
              {q.sub_label ? <b className="tp-sub">({q.sub_label}) </b> : null}
              {q.question_text}
            </span>
            <span className="tp-marks">[{q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}]</span>
          </div>
        );
      })}
      <div className="tp-foot">— End of paper —</div>
    </div>
  );
}

/** Opens the browser's print dialog for the paper only. */
function printPaperHtml(body: string, title: string) {
  const script =
    '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});<\/script>';
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title.replace(/</g, "&lt;")}</title><style>${PAPER_CSS}@page{size:A4;margin:14mm}` +
    `html,body{margin:0;padding:12px;background:#fff}@media print{html,body{padding:0}.tp{border:none;padding:0}}</style>` +
    `</head><body>${body}${script}</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => frame.remove(), 60_000);
}

/** The paper with a Print button above it. */
export function TheoryPaperView({ data, showPrint = true }: { data: TheoryPaperData; showPrint?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-3">
      <style>{PAPER_CSS}</style>
      {showPrint && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => ref.current && printPaperHtml(ref.current.innerHTML, data.title)}>
            <Printer className="mr-2 h-4 w-4" />Print question paper
          </Button>
        </div>
      )}
      <div className="overflow-x-auto" ref={ref}>
        <TheoryPaper data={data} />
      </div>
    </div>
  );
}
