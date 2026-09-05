// ReportCard.tsx
// Full Nigerian-style WAEC report card component.
// Renders a print-ready A4 card with:
//   - School branding header
//   - Student info grid
//   - Attendance summary
//   - Academic table (CAT scores → grade → remark)
//   - Psychomotor & Affective trait ratings (1–6 checkboxes)
//   - Performance bar chart (SVG, no library)
//   - Comments & signature boxes
//   - Grading key
//   - Print button (window.print())
//
// The existing call site in Grades.tsx passes { grades, studentName, term }
// — those props still work. All new props are optional so nothing breaks.

import { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawGrade {
  subject_name: string;
  category_name: string;
  category_max_score: number;
  score: number;
}

export interface PsychomotorData {
  verbal_fluency?:  number | null;
  handwriting?:     number | null;
  sports?:          number | null;
  games?:           number | null;
  musical_skills?:  number | null;
}

export interface AffectiveData {
  punctuality?:         number | null;
  neatness?:            number | null;
  politeness?:          number | null;
  honesty?:             number | null;
  cooperation?:         number | null;
  relationship?:        number | null;
  leadership?:          number | null;
  emotional_stability?: number | null;
  health?:              number | null;
  attitude_to_work?:    number | null;
  attentiveness?:       number | null;
  reliability?:         number | null;
  initiative?:          number | null;
}

export interface ReportCardProps {
  grades:                RawGrade[];
  studentName?:          string;
  admissionNumber?:      string;
  className?:            string;
  gender?:               string;
  age?:                  string | number;
  term?:                 string | null;
  session?:              string | null;
  schoolName?:           string;
  schoolLogoUrl?:        string;
  schoolAddress?:        string;
  schoolContact?:        string;
  timesSchoolOpened?:    number;
  timesPresent?:         number;
  timesAbsent?:          number;
  timesPunctual?:        number;
  classPosition?:        number | null;
  totalStudents?:        number | null;
  classTeacherComment?:  string;
  principalComment?:     string;
  reopeningDate?:        string | null;
  psychomotor?:          PsychomotorData;
  affective?:            AffectiveData;
  // Class averages per subject { [subjectName]: avgScore }
  classAverages?:        Record<string, number>;
  // Whether to show the Print button (hide on student/parent view if desired)
  showPrintButton?:      boolean;
}

// ─── Grade computation ────────────────────────────────────────────────────────

export function getGrade(pct: number): {
  grade: string; remark: string;
  bg: string; text: string; border: string;
} {
  if (pct >= 80) return { grade: "A1", remark: "Excellent",  bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" };
  if (pct >= 75) return { grade: "B2", remark: "Very Good",  bg: "#dcfce7", text: "#166534", border: "#86efac" };
  if (pct >= 65) return { grade: "B3", remark: "Good",       bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" };
  if (pct >= 60) return { grade: "C4", remark: "Credit",     bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" };
  if (pct >= 55) return { grade: "C5", remark: "Credit",     bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" };
  if (pct >= 50) return { grade: "C6", remark: "Credit",     bg: "#e0f2fe", text: "#0369a1", border: "#7dd3fc" };
  if (pct >= 45) return { grade: "D7", remark: "Pass",       bg: "#fef9c3", text: "#854d0e", border: "#fde047" };
  if (pct >= 40) return { grade: "E8", remark: "Weak Pass",  bg: "#ffedd5", text: "#9a3412", border: "#fdba74" };
  return              { grade: "F9", remark: "Fail",        bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatingCheckboxes({ value }: { value?: number | null }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5, 6].map(n => (
        <div key={n} style={{
          width: 16, height: 16, border: "1.5px solid #6b7280",
          borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: value === n ? "#1e3a5f" : "white",
          flexShrink: 0,
        }}>
          {value === n && (
            <svg viewBox="0 0 10 10" width="9" height="9">
              <polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="1.8"
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <td style={{ border: "1px solid #cbd5e1", padding: "4px 8px", verticalAlign: "top" }}>
      <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginTop: 1 }}>{value || "—"}</div>
    </td>
  );
}

// ─── Performance bar chart (pure SVG) ────────────────────────────────────────

function PerformanceChart({
  subjects, totalObtainable, classAverages,
}: {
  subjects: Array<{ name: string; total: number }>;
  totalObtainable: number;
  classAverages: Record<string, number>;
}) {
  if (subjects.length === 0 || totalObtainable === 0) return null;

  const BAR_H  = 14;
  const GAP    = 6;
  const LEFT   = 130;
  const RIGHT  = 20;
  const CHART_W = 380;
  const height = subjects.length * (BAR_H * 2 + GAP + 4) + 30;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#475569", marginBottom: 4 }}>
        Student Score vs Class Average
      </div>
      <svg width={LEFT + CHART_W + RIGHT} height={height} style={{ overflow: "visible" }}>
        {/* axis label */}
        {[0, 25, 50, 75, 100].map(tick => {
          const x = LEFT + (tick / 100) * CHART_W;
          return (
            <g key={tick}>
              <line x1={x} y1={20} x2={x} y2={height - 10} stroke="#e2e8f0" strokeWidth={1} />
              <text x={x} y={16} textAnchor="middle" fontSize={8} fill="#94a3b8">{tick}%</text>
            </g>
          );
        })}

        {subjects.map((s, i) => {
          const y = 22 + i * (BAR_H * 2 + GAP + 4);
          const pct = Math.min(100, Math.round((s.total / totalObtainable) * 100));
          const avgPct = Math.min(100, Math.round(((classAverages[s.name] ?? 0) / totalObtainable) * 100));
          const { grade } = getGrade(pct);
          const barW  = (pct    / 100) * CHART_W;
          const avgW  = (avgPct / 100) * CHART_W;
          const barColor = pct >= 50 ? "#2563eb" : "#ef4444";

          return (
            <g key={s.name}>
              {/* Subject label */}
              <text x={LEFT - 4} y={y + BAR_H - 2} textAnchor="end" fontSize={9} fill="#334155" fontWeight={600}>
                {s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name}
              </text>

              {/* Student bar */}
              <rect x={LEFT} y={y} width={Math.max(barW, 2)} height={BAR_H}
                fill={barColor} rx={2} opacity={0.85} />
              <text x={LEFT + barW + 3} y={y + BAR_H - 2} fontSize={8} fill={barColor} fontWeight={700}>
                {pct}% ({grade})
              </text>

              {/* Class avg bar */}
              <rect x={LEFT} y={y + BAR_H + 2} width={Math.max(avgW, 2)} height={BAR_H - 2}
                fill="#94a3b8" rx={2} opacity={0.7} />
              <text x={LEFT + avgW + 3} y={y + BAR_H * 2} fontSize={8} fill="#64748b">
                Avg: {avgPct}%
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <rect x={LEFT} y={height - 8} width={10} height={6} fill="#2563eb" rx={1} />
        <text x={LEFT + 13} y={height - 3} fontSize={8} fill="#475569">Student Score</text>
        <rect x={LEFT + 90} y={height - 8} width={10} height={6} fill="#94a3b8" rx={1} />
        <text x={LEFT + 103} y={height - 3} fontSize={8} fill="#475569">Class Average</text>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportCard({
  grades,
  studentName,
  admissionNumber,
  className,
  gender,
  age,
  term,
  session,
  schoolName,
  schoolLogoUrl,
  schoolAddress,
  schoolContact,
  timesSchoolOpened,
  timesPresent,
  timesAbsent,
  timesPunctual,
  classPosition,
  totalStudents,
  classTeacherComment,
  principalComment,
  reopeningDate,
  psychomotor,
  affective,
  classAverages = {},
  showPrintButton = true,
}: ReportCardProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // ── Build academic table data ──────────────────────────────────
  const subjectMap = new Map<string, Map<string, { score: number; maxScore: number }>>();
  const categorySet = new Map<string, number>();

  grades.forEach(g => {
    if (!subjectMap.has(g.subject_name)) subjectMap.set(g.subject_name, new Map());
    subjectMap.get(g.subject_name)!.set(g.category_name, {
      score: g.score,
      maxScore: g.category_max_score,
    });
    if (!categorySet.has(g.category_name)) categorySet.set(g.category_name, g.category_max_score);
  });

  const categories = Array.from(categorySet.entries());
  const subjectNames = Array.from(subjectMap.keys()).sort();
  const totalObtainable = categories.reduce((s, [, m]) => s + m, 0);

  // Build per-subject totals for chart
  const subjectTotals = subjectNames.map(name => {
    const catMap = subjectMap.get(name)!;
    let total = 0;
    catMap.forEach(v => (total += v.score));
    return { name, total };
  });

  // Overall percentage
  const grandTotal = subjectTotals.reduce((s, x) => s + x.total, 0);
  const maxPossible = subjectNames.length * totalObtainable;
  const overallPct = maxPossible > 0 ? ((grandTotal / maxPossible) * 100).toFixed(1) : "0.0";

  const handlePrint = () => window.print();

  if (grades.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>No grades recorded yet for this student.</p>
      </div>
    );
  }

  // ── Shared cell style ──────────────────────────────────────────
  const td: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    padding: "4px 6px",
    textAlign: "center",
    fontSize: 10,
  };
  const th: React.CSSProperties = {
    ...td,
    backgroundColor: "#1e3a5f",
    color: "white",
    fontWeight: 700,
    fontSize: 9,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  };

  const psychomotorFields: Array<{ key: keyof PsychomotorData; label: string }> = [
    { key: "verbal_fluency",  label: "Verbal Fluency" },
    { key: "handwriting",     label: "Handwriting"    },
    { key: "sports",          label: "Sports"         },
    { key: "games",           label: "Games"          },
    { key: "musical_skills",  label: "Musical Skills" },
  ];

  const affectiveFields: Array<{ key: keyof AffectiveData; label: string }> = [
    { key: "punctuality",         label: "Punctuality"          },
    { key: "neatness",            label: "Neatness"             },
    { key: "politeness",          label: "Politeness"           },
    { key: "honesty",             label: "Honesty"              },
    { key: "cooperation",         label: "Co-operation"         },
    { key: "relationship",        label: "Relationship"         },
    { key: "leadership",          label: "Leadership Ability"   },
    { key: "emotional_stability", label: "Emotional Stability"  },
    { key: "health",              label: "Health"               },
    { key: "attitude_to_work",    label: "Attitude to Work"     },
    { key: "attentiveness",       label: "Attentiveness"        },
    { key: "reliability",         label: "Reliability"          },
    { key: "initiative",          label: "Initiative"           },
  ];

  const maxRows = Math.max(psychomotorFields.length, affectiveFields.length);

  // ── The actual visual card markup, built once and reused for both the
  //    on-screen preview (which may sit inside a transformed/clipped Dialog)
  //    and the print copy (portaled straight to <body> so it isn't affected
  //    by any ancestor's `transform` or `overflow` — see note below). ──────
  const cardMarkup = (
        <div style={{
          fontFamily: "'Segoe UI', Arial, sans-serif",
          backgroundColor: "white",
          color: "#0f172a",
          maxWidth: 760,
          margin: "0 auto",
          border: "2px solid #1e3a5f",
          borderRadius: 6,
          overflow: "hidden",
        }}>

          {/* ── HEADER ─────────────────────────────────────────── */}
          <div style={{
            background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            {schoolLogoUrl && (
              <img src={schoolLogoUrl} alt="School logo"
                style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, background: "white", padding: 3 }} />
            )}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ color: "white", fontSize: 18, fontWeight: 800, letterSpacing: "0.02em" }}>
                {schoolName || "SCHOOL NAME"}
              </div>
              {schoolAddress && (
                <div style={{ color: "#bfdbfe", fontSize: 9, marginTop: 2 }}>{schoolAddress}</div>
              )}
              {schoolContact && (
                <div style={{ color: "#bfdbfe", fontSize: 9 }}>Contact: {schoolContact}</div>
              )}
              <div style={{
                color: "white", fontSize: 11, fontWeight: 700, marginTop: 6,
                textTransform: "uppercase", letterSpacing: "0.1em",
                borderTop: "1px solid rgba(255,255,255,0.3)", paddingTop: 5,
              }}>
                End of Term Academic Report
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 16px" }}>

            {/* ── STUDENT INFO GRID ──────────────────────────────── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <tbody>
                <tr>
                  <InfoCell label="Name of Student" value={studentName} />
                  <InfoCell label="Admission No." value={admissionNumber} />
                  <InfoCell label="Class" value={className} />
                  <InfoCell label="Session" value={session} />
                </tr>
                <tr>
                  <InfoCell label="Term" value={term} />
                  <InfoCell label="Sex" value={gender} />
                  <InfoCell label="Age" value={age ? `${age} yrs` : undefined} />
                  <InfoCell label="Overall Percentage" value={`${overallPct}%`} />
                </tr>
                <tr>
                  <InfoCell
                    label="Class Position"
                    value={classPosition && totalStudents ? `${classPosition} / ${totalStudents}` : classPosition ?? undefined}
                  />
                  <td colSpan={3} style={{ border: "1px solid #cbd5e1", padding: "4px 8px" }}>
                    <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Grading Scale</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                      {[
                        { g: "A1", r: "≥80% Excellent" }, { g: "B2", r: "75–79% V.Good" },
                        { g: "B3", r: "65–74% Good" },    { g: "C4", r: "60–64% Credit" },
                        { g: "C5", r: "55–59% Credit" },  { g: "C6", r: "50–54% Credit" },
                        { g: "D7", r: "45–49% Pass" },    { g: "E8", r: "40–44% W.Pass" },
                        { g: "F9", r: "<40% Fail" },
                      ].map(k => (
                        <span key={k.g} style={{ fontSize: 8, background: "#f1f5f9", borderRadius: 3, padding: "1px 4px", color: "#334155" }}>
                          <strong>{k.g}</strong>: {k.r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── ATTENDANCE ─────────────────────────────────────── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }} colSpan={4}>Attendance Record</th>
                </tr>
                <tr>
                  {["Times School Opened", "Times Present", "Times Absent", "Times Punctual"].map(h => (
                    <th key={h} style={{ ...th, background: "#334155" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[timesSchoolOpened, timesPresent, timesAbsent, timesPunctual].map((v, i) => (
                    <td key={i} style={{ ...td, fontWeight: 700, fontSize: 13 }}>{v ?? "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* ── ACADEMIC TABLE ─────────────────────────────────── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", minWidth: 130 }}>Subject</th>
                  {categories.map(([name, max]) => (
                    <th key={name} style={{ ...th, minWidth: 52 }}>
                      <div>{name}</div>
                      <div style={{ fontWeight: 400, opacity: 0.8, fontSize: 8 }}>({max})</div>
                    </th>
                  ))}
                  <th style={{ ...th, minWidth: 52 }}>Total<div style={{ fontWeight: 400, fontSize: 8, opacity: 0.8 }}>({totalObtainable})</div></th>
                  <th style={{ ...th, minWidth: 44 }}>%</th>
                  <th style={{ ...th, minWidth: 36 }}>Grade</th>
                  <th style={{ ...th, minWidth: 72 }}>Remark</th>
                </tr>
              </thead>
              <tbody>
                {subjectNames.map((subjectName, idx) => {
                  const catMap = subjectMap.get(subjectName)!;
                  let totalScore = 0;
                  const catScores = categories.map(([catName]) => {
                    const entry = catMap.get(catName);
                    const sc = entry?.score ?? null;
                    if (sc !== null) totalScore += sc;
                    return { catName, sc };
                  });
                  const pct = totalObtainable > 0 ? Math.round((totalScore / totalObtainable) * 100) : 0;
                  const { grade, remark, bg, text, border } = getGrade(pct);
                  const rowBg = idx % 2 === 0 ? "white" : "#f8fafc";

                  return (
                    <tr key={subjectName} style={{ backgroundColor: rowBg }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{subjectName}</td>
                      {catScores.map(({ catName, sc }) => (
                        <td key={catName} style={td}>{sc !== null ? sc : "—"}</td>
                      ))}
                      <td style={{ ...td, fontWeight: 700, color: "#1e3a5f" }}>{totalScore}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{pct}%</td>
                      <td style={{ ...td }}>
                        <span style={{
                          display: "inline-block", borderRadius: 4,
                          padding: "1px 6px", fontSize: 10, fontWeight: 700,
                          backgroundColor: bg, color: text, border: `1px solid ${border}`,
                        }}>{grade}</span>
                      </td>
                      <td style={{ ...td, color: text, fontWeight: 600 }}>{remark}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── PSYCHOMOTOR + AFFECTIVE TRAITS (side-by-side) ──── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", width: "50%" }} colSpan={2}>Psychomotor Skills</th>
                  <th style={{ ...th, textAlign: "left", width: "50%" }} colSpan={2}>Affective Traits</th>
                </tr>
                <tr>
                  <th style={{ ...th, background: "#334155", textAlign: "left" }}>Skill</th>
                  <th style={{ ...th, background: "#334155" }}>Rating (1–6)</th>
                  <th style={{ ...th, background: "#334155", textAlign: "left" }}>Trait</th>
                  <th style={{ ...th, background: "#334155" }}>Rating (1–6)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRows }).map((_, i) => {
                  const pm = psychomotorFields[i];
                  const af = affectiveFields[i];
                  const rowBg = i % 2 === 0 ? "white" : "#f8fafc";
                  return (
                    <tr key={i} style={{ backgroundColor: rowBg }}>
                      <td style={{ ...td, textAlign: "left" }}>{pm ? pm.label : ""}</td>
                      <td style={{ ...td }}>
                        {pm ? <RatingCheckboxes value={psychomotor?.[pm.key]} /> : ""}
                      </td>
                      <td style={{ ...td, textAlign: "left" }}>{af ? af.label : ""}</td>
                      <td style={{ ...td }}>
                        {af ? <RatingCheckboxes value={affective?.[af.key]} /> : ""}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} style={{ ...td, textAlign: "left", backgroundColor: "#f8fafc" }}>
                    <span style={{ fontSize: 8, color: "#64748b" }}>
                      <strong>Grading Key:</strong>&nbsp;
                      6 = Excellent &nbsp;|&nbsp; 5 = Very Good &nbsp;|&nbsp; 4 = Good &nbsp;|&nbsp;
                      3 = Average &nbsp;|&nbsp; 2 = Below Average &nbsp;|&nbsp; 1 = Unsatisfactory
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── PERFORMANCE CHART ──────────────────────────────── */}
            {subjectTotals.length > 0 && (
              <PerformanceChart
                subjects={subjectTotals}
                totalObtainable={totalObtainable}
                classAverages={classAverages}
              />
            )}

            {/* ── COMMENTS + SIGNATURES ──────────────────────────── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #cbd5e1", padding: 8, width: "50%", verticalAlign: "top" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
                      Class Teacher's Comment
                    </div>
                    <div style={{ fontSize: 11, minHeight: 28, color: "#0f172a" }}>
                      {classTeacherComment || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}
                    </div>
                    <div style={{ marginTop: 16, borderTop: "1px solid #cbd5e1", paddingTop: 4, fontSize: 9, color: "#64748b" }}>
                      Signature: ____________________
                    </div>
                  </td>
                  <td style={{ border: "1px solid #cbd5e1", padding: 8, verticalAlign: "top" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
                      Principal's Comment
                    </div>
                    <div style={{ fontSize: 11, minHeight: 28, color: "#0f172a" }}>
                      {principalComment || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}
                    </div>
                    <div style={{ marginTop: 16, borderTop: "1px solid #cbd5e1", paddingTop: 4, fontSize: 9, color: "#64748b" }}>
                      Signature: ____________________
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── FOOTER ─────────────────────────────────────────── */}
            <div style={{
              marginTop: 10,
              background: "#f1f5f9",
              borderRadius: 4,
              padding: "6px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 9,
              color: "#475569",
            }}>
              <span>
                <strong>Next Term Begins:</strong>{" "}
                {reopeningDate
                  ? new Date(reopeningDate).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  : "To be announced"}
              </span>
              <span style={{ color: "#94a3b8" }}>
                Fees are payable on or before the first day of each term.
              </span>
            </div>

          </div>
        </div>
  );

  return (
    <>
      {/* ── Print button (hidden during print) ─────────────────── */}
      {showPrintButton && (
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      )}

      {/* ── Print styles injected inline so they travel with the component.
             #report-card-print-root only exists inside the portal below,
             which is mounted directly on document.body — NOT inside this
             component's normal DOM position. That matters because callers
             (e.g. the admin preview Dialog) may render <ReportCard /> inside
             a container with `transform` (Radix Dialog uses translate-x/y to
             center itself) and/or `overflow: auto`. A `transform` on any
             ancestor creates a new containing block for `position: fixed`
             descendants, so "fixed; inset:0" would resolve against that
             small, scrollable dialog box instead of the viewport — getting
             clipped to whatever was currently scrolled into view (this was
             the cause of print/PDF output showing only the header and
             nothing else). Portaling to <body> guarantees no such ancestor
             exists between the print root and the viewport. ────────────── */}
      <style>{`
        #report-card-print-root { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #report-card-print-root,
          #report-card-print-root * { visibility: visible !important; }
          #report-card-print-root {
            display: block !important;
            position: fixed; inset: 0; padding: 0; margin: 0;
          }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      {/* On-screen preview — renders wherever the caller placed <ReportCard />
          (e.g. inside the admin preview Dialog). Hidden during print since
          the portal copy below is what actually gets printed. */}
      <div className="print:hidden" ref={printRef}>
        {cardMarkup}
      </div>

      {/* Print-only copy, portaled to <body> so `position: fixed` works
          correctly regardless of any transformed/clipped ancestor. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div id="report-card-print-root">{cardMarkup}</div>,
          document.body,
        )}
    </>
  );
}
