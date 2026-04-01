// Nigerian-style WAEC Report Card Component
// Used in both Student Dashboard and Parent Dashboard

interface RawGrade {
  subject_name: string;
  category_name: string;
  category_max_score: number;
  score: number;
}

interface ReportCardProps {
  grades: RawGrade[];
  studentName?: string;
  term?: string | null;
  session?: string | null;
  schoolName?: string;
}

// WAEC-style grading A1–F9 based on percentage
function getGrade(pct: number): { grade: string; remark: string; bg: string; text: string } {
  if (pct >= 75) return { grade: "A1", remark: "Excellent",  bg: "bg-emerald-100", text: "text-emerald-800" };
  if (pct >= 70) return { grade: "B2", remark: "Very Good",  bg: "bg-green-100",   text: "text-green-800"  };
  if (pct >= 65) return { grade: "B3", remark: "Good",       bg: "bg-teal-100",    text: "text-teal-800"   };
  if (pct >= 60) return { grade: "C4", remark: "Credit",     bg: "bg-blue-100",    text: "text-blue-800"   };
  if (pct >= 55) return { grade: "C5", remark: "Credit",     bg: "bg-blue-100",    text: "text-blue-700"   };
  if (pct >= 50) return { grade: "C6", remark: "Credit",     bg: "bg-sky-100",     text: "text-sky-800"    };
  if (pct >= 45) return { grade: "D7", remark: "Pass",       bg: "bg-yellow-100",  text: "text-yellow-800" };
  if (pct >= 40) return { grade: "E8", remark: "Pass",       bg: "bg-orange-100",  text: "text-orange-800" };
  return              { grade: "F9", remark: "Fail",       bg: "bg-red-100",     text: "text-red-800"    };
}

export default function ReportCard({ grades, studentName, term, session, schoolName }: ReportCardProps) {
  if (grades.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>No grades recorded yet.</p>
      </div>
    );
  }

  // Group grades by subject
  const subjectMap = new Map<string, Map<string, { score: number; maxScore: number }>>();
  const categorySet = new Map<string, number>(); // category name -> max_score

  grades.forEach(g => {
    if (!subjectMap.has(g.subject_name)) subjectMap.set(g.subject_name, new Map());
    subjectMap.get(g.subject_name)!.set(g.category_name, {
      score: g.score,
      maxScore: g.category_max_score,
    });
    if (!categorySet.has(g.category_name)) {
      categorySet.set(g.category_name, g.category_max_score);
    }
  });

  // Ordered list of categories
  const categories = Array.from(categorySet.entries()); // [name, maxScore]
  const subjects = Array.from(subjectMap.keys()).sort();
  const totalObtainable = categories.reduce((sum, [, max]) => sum + max, 0);

  return (
    <div className="space-y-4">
      {/* Header info */}
      {(studentName || term || session || schoolName) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3">
          {studentName && <p className="font-bold text-sm">{studentName}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {session && <span>Session: <strong className="text-foreground">{session}</strong></span>}
            {term && <span>Term: <strong className="text-foreground">{term}</strong></span>}
          </div>
        </div>
      )}

      {/* Report Card Table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Row 1: Category names */}
            <tr className="bg-primary text-primary-foreground">
              <th className="border border-primary/30 px-3 py-2 text-left font-bold min-w-[140px]">Subject</th>
              {categories.map(([catName]) => (
                <th key={catName} className="border border-primary/30 px-2 py-2 text-center font-semibold min-w-[70px]">
                  {catName}
                </th>
              ))}
              <th className="border border-primary/30 px-2 py-2 text-center font-bold min-w-[60px]">Total</th>
              <th className="border border-primary/30 px-2 py-2 text-center font-bold min-w-[50px]">%</th>
              <th className="border border-primary/30 px-2 py-2 text-center font-bold min-w-[50px]">Grade</th>
              <th className="border border-primary/30 px-2 py-2 text-center font-bold min-w-[90px]">Remark</th>
            </tr>
            {/* Row 2: Obtainable marks */}
            <tr className="bg-primary/10">
              <th className="border border-border px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                Obtainable
              </th>
              {categories.map(([catName, maxScore]) => (
                <th key={catName} className="border border-border px-2 py-1.5 text-center text-xs font-bold text-primary">
                  {maxScore}
                </th>
              ))}
              <th className="border border-border px-2 py-1.5 text-center text-xs font-bold text-primary">
                {totalObtainable}
              </th>
              <th className="border border-border px-2 py-1.5 text-center text-xs text-muted-foreground">—</th>
              <th className="border border-border px-2 py-1.5 text-center text-xs text-muted-foreground">—</th>
              <th className="border border-border px-2 py-1.5 text-center text-xs text-muted-foreground">—</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subjectName, idx) => {
              const catGrades = subjectMap.get(subjectName)!;
              let totalScore = 0;

              // collect scores per category
              const catScores = categories.map(([catName, maxScore]) => {
                const entry = catGrades.get(catName);
                const score = entry?.score ?? null;
                if (score !== null) totalScore += score;
                return { catName, maxScore, score };
              });

              const pct = totalObtainable > 0 ? Math.round((totalScore / totalObtainable) * 100) : 0;
              const { grade, remark, bg, text } = getGrade(pct);

              return (
                <tr key={subjectName} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="border border-border px-3 py-2 font-medium">{subjectName}</td>
                  {catScores.map(({ catName, score }) => (
                    <td key={catName} className="border border-border px-2 py-2 text-center">
                      {score !== null ? (
                        <span className="inline-flex items-center justify-center w-9 h-8 rounded bg-white dark:bg-muted border font-semibold text-sm shadow-sm">
                          {score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  ))}
                  {/* Total */}
                  <td className="border border-border px-2 py-2 text-center">
                    <span className="inline-flex items-center justify-center w-10 h-8 rounded bg-primary/10 border border-primary/20 font-bold text-sm text-primary">
                      {totalScore}
                    </span>
                  </td>
                  {/* Percentage */}
                  <td className="border border-border px-2 py-2 text-center font-semibold text-sm">
                    {pct}%
                  </td>
                  {/* Grade */}
                  <td className="border border-border px-2 py-2 text-center">
                    <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-bold ${bg} ${text}`}>
                      {grade}
                    </span>
                  </td>
                  {/* Remark */}
                  <td className="border border-border px-2 py-2 text-center">
                    <span className={`text-xs font-medium ${text}`}>{remark}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grading Key */}
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">WAEC Grading Key</p>
        <div className="flex flex-wrap gap-2">
          {[
            { grade: "A1", range: "75–100", remark: "Excellent",  bg: "bg-emerald-100", text: "text-emerald-800" },
            { grade: "B2", range: "70–74",  remark: "Very Good",  bg: "bg-green-100",   text: "text-green-800"  },
            { grade: "B3", range: "65–69",  remark: "Good",       bg: "bg-teal-100",    text: "text-teal-800"   },
            { grade: "C4", range: "60–64",  remark: "Credit",     bg: "bg-blue-100",    text: "text-blue-800"   },
            { grade: "C5", range: "55–59",  remark: "Credit",     bg: "bg-blue-100",    text: "text-blue-700"   },
            { grade: "C6", range: "50–54",  remark: "Credit",     bg: "bg-sky-100",     text: "text-sky-800"    },
            { grade: "D7", range: "45–49",  remark: "Pass",       bg: "bg-yellow-100",  text: "text-yellow-800" },
            { grade: "E8", range: "40–44",  remark: "Pass",       bg: "bg-orange-100",  text: "text-orange-800" },
            { grade: "F9", range: "0–39",   remark: "Fail",       bg: "bg-red-100",     text: "text-red-800"    },
          ].map(k => (
            <div key={k.grade} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${k.bg}`}>
              <span className={`font-bold text-xs ${k.text}`}>{k.grade}</span>
              <span className={`text-xs ${k.text} opacity-80`}>{k.range}% — {k.remark}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
