// src/lib/exams.ts
// Shared types and helpers for the CBT exam feature
// (teacher screens, student screens and results).

export type ExamType = "mcq" | "theory";
export type ExamStatus = "draft" | "scheduled" | "open" | "closed";

export interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  subject_id: string;
  class_id: string | null;
  term_id: string | null;
  school_id: string | null;
  exam_type: ExamType;
  duration_minutes: number;
  start_date: string | null;
  end_date: string | null;
  is_published: boolean;
  allow_retake: boolean;
  shuffle_questions: boolean;
  created_by: string | null;
  created_at: string;
  subjects?: { name: string } | null;
  classes?: { name: string } | null;
  questions?: { count: number }[] | null;
  theory_questions?: { count: number }[] | null;
  exam_attempts?: { count: number }[] | null;
}

export interface McqQuestion {
  id: string;
  exam_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  question_order: number;
}

export interface TheoryQuestion {
  id: string;
  exam_id: string;
  question_number: string;
  sub_label: string | null;
  question_text: string;
  marks: number;
  question_order: number;
}

/** The pass mark used everywhere else in the app (Results, student and parent views). */
export const PASS_PERCENT = 50;

/** Number from a PostgREST count embed such as questions(count). */
export function embeddedCount(v: { count: number }[] | null | undefined): number {
  return v && v.length > 0 ? Number(v[0].count) || 0 : 0;
}

export function examStatus(e: Pick<ExamRow, "is_published" | "start_date" | "end_date">, now = Date.now()): ExamStatus {
  if (!e.is_published) return "draft";
  if (e.start_date && now < new Date(e.start_date).getTime()) return "scheduled";
  if (e.end_date && now > new Date(e.end_date).getTime()) return "closed";
  return "open";
}

export const STATUS_LABEL: Record<ExamStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** ISO timestamp -> value for <input type="datetime-local"> (in the viewer's time zone). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO timestamp (or null when empty). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** 3725 -> "1:02:05", 605 -> "10:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function percent(score: number | null | undefined, total: number | null | undefined): number {
  if (!total) return 0;
  return Math.round(((score ?? 0) / total) * 100);
}

// ─────────────────────────────────────────────────────────────────
// Bulk question upload (CSV / tab-separated text pasted from Excel)
// ─────────────────────────────────────────────────────────────────
export interface ParsedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
}

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: string[];
}

export const CSV_TEMPLATE =
  "question,option_a,option_b,option_c,option_d,correct\n" +
  "What is 2 + 2?,3,4,5,6,B\n" +
  "\"Which of these is a prime number, in the list?\",4,6,7,9,C\n";

/** Split text into rows of cells. Handles "quoted, cells", doubled quotes and line breaks inside quotes. */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const LETTER_FOR_NUMBER: Record<string, "A" | "B" | "C" | "D"> = { "1": "A", "2": "B", "3": "C", "4": "D" };

export function parseQuestionsCsv(raw: string): ParseResult {
  const text = (raw || "").replace(/^\uFEFF/, "");
  const result: ParseResult = { questions: [], errors: [] };
  if (!text.trim()) {
    result.errors.push("Nothing to import — paste your questions or choose a file.");
    return result;
  }

  // Excel paste = tab separated; files = comma separated
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = splitRows(text, delimiter);

  // Skip a header row ("question,option_a,...")
  const looksLikeHeader = rows.length > 0 && /^\s*(question|q|no|s\/n)/i.test(rows[0][0] || "") &&
    /option|a$|correct|answer/i.test(rows[0].slice(1).join(" "));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const offset = looksLikeHeader ? 2 : 1; // human line number of dataRows[0]

  dataRows.forEach((cells, i) => {
    const line = i + offset;
    const c = cells.map((x) => x.trim());
    if (c.length < 6) {
      result.errors.push(`Row ${line}: needs 6 columns (question, 4 options, correct answer) but has ${c.length}.`);
      return;
    }
    const [question, a, b, cc, d, correctRaw] = c;
    if (!question) { result.errors.push(`Row ${line}: the question is empty.`); return; }
    if (!a || !b || !cc || !d) { result.errors.push(`Row ${line}: all four options (A–D) must be filled in.`); return; }

    let correct = correctRaw.toUpperCase().replace(/[^A-D1-4]/g, "").slice(0, 1);
    if (LETTER_FOR_NUMBER[correct]) correct = LETTER_FOR_NUMBER[correct];
    if (!["A", "B", "C", "D"].includes(correct)) {
      result.errors.push(`Row ${line}: the correct answer must be A, B, C or D (found "${correctRaw}").`);
      return;
    }
    result.questions.push({
      question_text: question, option_a: a, option_b: b, option_c: cc, option_d: d,
      correct_option: correct as "A" | "B" | "C" | "D",
    });
  });

  if (result.questions.length === 0 && result.errors.length === 0) {
    result.errors.push("No questions were found.");
  }
  return result;
}

/** Friendly text for database errors raised by the exam functions / row-level security. */
export function friendlyExamError(message: string | undefined | null): string {
  const m = (message || "").trim();
  if (!m) return "Something went wrong. Please try again.";
  if (/row-level security|violates row-level/i.test(m)) {
    return "You can only manage exams for the subjects and classes assigned to you.";
  }
  if (/permission denied/i.test(m)) return "You do not have permission to do that.";
  if (/exams_window_check/.test(m)) return "The end time must be after the start time.";
  if (/exams_duration_check/.test(m)) return "Duration must be between 1 and 600 minutes.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Network problem — please check your connection and try again.";
  return m;
}
