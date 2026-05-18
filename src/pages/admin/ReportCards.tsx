// src/pages/admin/ReportCards.tsx
// Admin page for managing full report cards per class/term.
//
// ATTENDANCE NOTE:
//   times_school_opened is entered manually per student card — only the school
//   knows how many days that term ran (e.g. 120).
//   The other three fields can be auto-filled from the attendance table.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSchoolName, useSchoolLogo } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Eye, Save, Send, RefreshCw,
  ChevronDown, ChevronUp, GraduationCap, ClipboardList,
} from "lucide-react";
import ReportCard from "@/components/ReportCard";
import type { PsychomotorData, AffectiveData, RawGrade } from "@/components/ReportCard";

interface ClassItem   { id: string; name: string; }
interface TermItem    { id: string; name: string; session_id: string; }
interface SessionItem { id: string; name: string; }
interface StudentItem {
  user_id: string; full_name: string; username: string | null;
  gender: string | null; date_of_birth: string | null;
}
interface RatingField<T> { key: keyof T; label: string; }

const PSYCHOMOTOR_FIELDS: RatingField<PsychomotorData>[] = [
  { key: "verbal_fluency",  label: "Verbal Fluency"  },
  { key: "handwriting",     label: "Handwriting"     },
  { key: "sports",          label: "Sports"          },
  { key: "games",           label: "Games"            },
  { key: "musical_skills",  label: "Musical Skills"  },
];

const AFFECTIVE_FIELDS: RatingField<AffectiveData>[] = [
  { key: "punctuality",         label: "Punctuality"         },
  { key: "neatness",            label: "Neatness"            },
  { key: "politeness",          label: "Politeness"          },
  { key: "honesty",             label: "Honesty"             },
  { key: "cooperation",         label: "Co-operation"        },
  { key: "relationship",        label: "Relationship"        },
  { key: "leadership",          label: "Leadership Ability"  },
  { key: "emotional_stability", label: "Emotional Stability" },
  { key: "health",              label: "Health"              },
  { key: "attitude_to_work",    label: "Attitude to Work"    },
  { key: "attentiveness",       label: "Attentiveness"       },
  { key: "reliability",         label: "Reliability"         },
  { key: "initiative",          label: "Initiative"          },
];

function RatingSelector({ value, onChange, label }: {
  value?: number | null; onChange: (v: number | null) => void; label: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map(n => (
          <button key={n} type="button" onClick={() => onChange(value === n ? null : n)}
            className={`w-7 h-7 rounded text-xs font-bold border transition-all ${
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border text-muted-foreground"
            }`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, hint }: {
  label: string; value: number | undefined;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      <Input type="number" min={0} value={value ?? ""}
        onChange={e => onChange(parseInt(e.target.value) || 0)} />
    </div>
  );
}

export default function ReportCards() {
  const { user, schoolId } = useAuth();
  const { schoolName }     = useSchoolName();
  const { logoUrl }        = useSchoolLogo();

  const [classes,  setClasses]  = useState<ClassItem[]>([]);
  const [terms,    setTerms]    = useState<TermItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTerm,  setSelectedTerm]  = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolContact, setSchoolContact] = useState("");

  const [metadataMap,    setMetadataMap]    = useState<Record<string, any>>({});
  const [psychomotorMap, setPsychomotorMap] = useState<Record<string, PsychomotorData>>({});
  const [affectiveMap,   setAffectiveMap]   = useState<Record<string, AffectiveData>>({});
  const [gradesMap,      setGradesMap]      = useState<Record<string, RawGrade[]>>({});
  const [classAverages,  setClassAverages]  = useState<Record<string, number>>({});

  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [savingStudent,   setSavingStudent]   = useState<string | null>(null);
  const [publishingAll,   setPublishingAll]   = useState(false);
  const [previewStudent,  setPreviewStudent]  = useState<StudentItem | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const [clsRes, termRes, sessRes, settingsRes] = await Promise.all([
        supabase.from("classes").select("id,name").eq("school_id", schoolId).order("name"),
        supabase.from("terms").select("id,name,session_id").eq("school_id", schoolId).order("name"),
        supabase.from("sessions").select("id,name").eq("school_id", schoolId).order("name"),
        supabase.from("school_settings").select("key,value").eq("school_id", schoolId)
          .in("key", ["school_address", "school_contact"]),
      ]);
      setClasses((clsRes.data   as ClassItem[])   || []);
      setTerms  ((termRes.data  as TermItem[])    || []);
      setSessions((sessRes.data as SessionItem[]) || []);
      ((settingsRes.data || []) as any[]).forEach(s => {
        if (s.key === "school_address") setSchoolAddress(s.value || "");
        if (s.key === "school_contact") setSchoolContact(s.value  || "");
      });
      setLoading(false);
    })();
  }, [schoolId]);

  const loadStudents = useCallback(async () => {
    if (!selectedClass || !schoolId) { setStudents([]); return; }
    const { data } = await supabase.rpc("get_school_students_only", { _school_id: schoolId });
    setStudents(((data as any[]) || [])
      .filter((s: any) => s.class_id === selectedClass)
      .map((s: any) => ({
        user_id: s.user_id, full_name: s.full_name,
        username: s.username || null, gender: s.gender || null,
        date_of_birth: s.date_of_birth || null,
      })));
  }, [selectedClass, schoolId]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    if (!selectedClass || !selectedTerm || !schoolId || students.length === 0) return;
    (async () => {
      const ids = students.map(s => s.user_id);
      const [metaRes, pmRes, afRes, gradesRes] = await Promise.all([
        supabase.from("report_card_metadata").select("*")
          .eq("term_id", selectedTerm).eq("class_id", selectedClass).in("student_id", ids),
        supabase.from("psychomotor_ratings").select("*")
          .eq("term_id", selectedTerm).in("student_id", ids),
        supabase.from("affective_ratings").select("*")
          .eq("term_id", selectedTerm).in("student_id", ids),
        supabase.from("grades")
          .select("student_id,score,subjects:subject_id(name),grade_categories:category_id(name,max_score)")
          .eq("class_id", selectedClass).eq("term_id", selectedTerm).eq("school_id", schoolId),
      ]);

      const mMap: Record<string, any> = {};
      (metaRes.data || []).forEach((r: any) => { mMap[r.student_id] = r; });
      setMetadataMap(mMap);

      const pmMap: Record<string, PsychomotorData> = {};
      (pmRes.data || []).forEach((r: any) => { pmMap[r.student_id] = r; });
      setPsychomotorMap(pmMap);

      const afMap: Record<string, AffectiveData> = {};
      (afRes.data || []).forEach((r: any) => { afMap[r.student_id] = r; });
      setAffectiveMap(afMap);

      const gMap: Record<string, RawGrade[]> = {};
      const subjTotals: Record<string, { sum: number; count: number }> = {};
      ((gradesRes.data || []) as any[]).forEach((g: any) => {
        const sid = g.student_id, sname = g.subjects?.name || "—";
        if (!gMap[sid]) gMap[sid] = [];
        gMap[sid].push({
          subject_name: sname, category_name: g.grade_categories?.name || "—",
          category_max_score: g.grade_categories?.max_score ?? 0, score: g.score,
        });
        if (!subjTotals[sname]) subjTotals[sname] = { sum: 0, count: 0 };
        subjTotals[sname].sum += g.score; subjTotals[sname].count += 1;
      });
      setGradesMap(gMap);

      const avgs: Record<string, number> = {};
      Object.entries(subjTotals).forEach(([n, { sum, count }]) => {
        avgs[n] = count > 0 ? Math.round(sum / count) : 0;
      });
      setClassAverages(avgs);
    })();
  }, [selectedClass, selectedTerm, schoolId, students]);

  const autoFillAttendance = async (studentId: string) => {
    if (!selectedClass) return;
    const { data } = await supabase.from("attendance").select("status")
      .eq("student_id", studentId).eq("class_id", selectedClass);
    const records  = (data || []) as any[];
    const present  = records.filter(r => r.status === "present").length;
    const absent   = records.filter(r => r.status === "absent").length;
    const late     = records.filter(r => r.status === "late").length;
    setMetadataMap(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        times_present:  present + late,
        times_absent:   absent,
        times_punctual: present,
        // times_school_opened intentionally NOT overwritten
      },
    }));
    toast.success("Auto-filled. Remember to set "Times School Opened" manually.");
  };

  const setMeta = (sid: string, field: string, value: any) =>
    setMetadataMap(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [field]: value } }));

  const saveStudent = async (student: StudentItem) => {
    if (!schoolId || !user) return;
    setSavingStudent(student.user_id);
    try {
      const meta = metadataMap[student.user_id]    || {};
      const pm   = psychomotorMap[student.user_id] || {};
      const af   = affectiveMap[student.user_id]   || {};
      const [e1, e2, e3] = await Promise.all([
        supabase.from("report_card_metadata").upsert({
          student_id: student.user_id, term_id: selectedTerm,
          class_id: selectedClass, school_id: schoolId,
          times_school_opened:   meta.times_school_opened   ?? 0,
          times_present:         meta.times_present         ?? 0,
          times_absent:          meta.times_absent          ?? 0,
          times_punctual:        meta.times_punctual        ?? 0,
          class_teacher_comment: meta.class_teacher_comment ?? "",
          principal_comment:     meta.principal_comment     ?? "",
          reopening_date:        meta.reopening_date        ?? null,
          is_published:          meta.is_published          ?? false,
        } as any, { onConflict: "student_id,term_id" }).then(r => r.error),
        supabase.from("psychomotor_ratings").upsert({
          student_id: student.user_id, term_id: selectedTerm, school_id: schoolId,
          verbal_fluency: pm.verbal_fluency ?? null, handwriting: pm.handwriting ?? null,
          sports: pm.sports ?? null, games: pm.games ?? null, musical_skills: pm.musical_skills ?? null,
        } as any, { onConflict: "student_id,term_id" }).then(r => r.error),
        supabase.from("affective_ratings").upsert({
          student_id: student.user_id, term_id: selectedTerm, school_id: schoolId,
          punctuality: af.punctuality ?? null, neatness: af.neatness ?? null,
          politeness: af.politeness ?? null, honesty: af.honesty ?? null,
          cooperation: af.cooperation ?? null, relationship: af.relationship ?? null,
          leadership: af.leadership ?? null, emotional_stability: af.emotional_stability ?? null,
          health: af.health ?? null, attitude_to_work: af.attitude_to_work ?? null,
          attentiveness: af.attentiveness ?? null, reliability: af.reliability ?? null,
          initiative: af.initiative ?? null,
        } as any, { onConflict: "student_id,term_id" }).then(r => r.error),
      ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
      toast.success(`Saved — ${student.full_name}`);
    } catch (err: any) { toast.error(err.message); }
    setSavingStudent(null);
  };

  const publishAll = async () => {
    if (!schoolId || students.length === 0) return;
    setPublishingAll(true);
    try {
      const rankings = students.map(s => {
        const sg = gradesMap[s.user_id] || [];
        const sm = new Map<string, number>(), cm = new Map<string, number>();
        sg.forEach(g => { sm.set(g.subject_name, (sm.get(g.subject_name) || 0) + g.score); cm.set(g.category_name, g.category_max_score); });
        const tot = Array.from(new Set(sg.map(g => g.category_name))).reduce((s, c) => s + (cm.get(c) || 0), 0);
        const grand = Array.from(sm.values()).reduce((a, b) => a + b, 0);
        const n = sm.size;
        return { user_id: s.user_id, avgPct: n > 0 && tot > 0 ? (grand / (n * tot)) * 100 : 0 };
      });
      rankings.sort((a, b) => b.avgPct - a.avgPct);
      const posMap: Record<string, number> = {};
      let pos = 1;
      rankings.forEach((r, i) => {
        if (i > 0 && r.avgPct < rankings[i - 1].avgPct) pos = i + 1;
        posMap[r.user_id] = pos;
      });
      await Promise.all(students.map(s => {
        const meta = metadataMap[s.user_id] || {};
        return supabase.from("report_card_metadata").upsert({
          student_id: s.user_id, term_id: selectedTerm,
          class_id: selectedClass, school_id: schoolId,
          times_school_opened:   meta.times_school_opened   ?? 0,
          times_present:         meta.times_present         ?? 0,
          times_absent:          meta.times_absent          ?? 0,
          times_punctual:        meta.times_punctual        ?? 0,
          class_teacher_comment: meta.class_teacher_comment ?? "",
          principal_comment:     meta.principal_comment     ?? "",
          reopening_date:        meta.reopening_date        ?? null,
          is_published: true, class_position: posMap[s.user_id] ?? null, total_students: students.length,
        } as any, { onConflict: "student_id,term_id" });
      }));
      const { data: fresh } = await supabase.from("report_card_metadata").select("*")
        .eq("term_id", selectedTerm).eq("class_id", selectedClass)
        .in("student_id", students.map(s => s.user_id));
      const mMap: Record<string, any> = {};
      (fresh || []).forEach((r: any) => { mMap[r.student_id] = r; });
      setMetadataMap(mMap);
      toast.success(`Published ${students.length} report cards with class positions`);
    } catch (err: any) { toast.error(err.message); }
    setPublishingAll(false);
  };

  const getAge = (dob: string | null) => {
    if (!dob) return undefined;
    const b = new Date(dob), t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  };
  const selectedSessionName = (() => {
    const t = terms.find(t => t.id === selectedTerm);
    return t ? sessions.find(s => s.id === t.session_id)?.name || "" : "";
  })();

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const publishedCount = students.filter(s => metadataMap[s.user_id]?.is_published).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Cards</h1>
        <p className="text-muted-foreground mt-1">Enter attendance, rate traits, add comments, then publish.</p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setExpandedStudent(null); }}>
                <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={selectedTerm} onValueChange={v => { setSelectedTerm(v); setExpandedStudent(null); }}>
                <SelectTrigger><SelectValue placeholder="Select term…" /></SelectTrigger>
                <SelectContent>{terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedClass && selectedTerm && (
        <>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-5">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /><strong>{students.length}</strong> students</span>
                <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-emerald-600" /><strong className="text-emerald-600">{publishedCount}</strong> published</span>
              </div>
              <Button onClick={publishAll} disabled={publishingAll || students.length === 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                {publishingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Compute Positions &amp; Publish All
              </Button>
            </CardContent>
          </Card>

          {students.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No students found in this class.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {students.map(student => {
                const meta = metadataMap[student.user_id] || {};
                const pm   = psychomotorMap[student.user_id] || {};
                const af   = affectiveMap[student.user_id]   || {};
                const isExpanded = expandedStudent === student.user_id;
                return (
                  <Card key={student.user_id} className={meta.is_published ? "border-emerald-200 bg-emerald-50/30" : ""}>
                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                      onClick={() => setExpandedStudent(isExpanded ? null : student.user_id)}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {student.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{student.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.username ? `Adm: ${student.username}` : "No admission no."}
                            {meta.class_position ? ` · Position: ${meta.class_position}/${meta.total_students}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {meta.is_published
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Published</Badge>
                          : <Badge variant="secondary">Draft</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={e => { e.stopPropagation(); setPreviewStudent(student); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <CardContent className="pt-0 pb-4 border-t">
                        <Tabs defaultValue="attendance" className="mt-3">
                          <TabsList>
                            <TabsTrigger value="attendance">Attendance</TabsTrigger>
                            <TabsTrigger value="psychomotor">Psychomotor</TabsTrigger>
                            <TabsTrigger value="affective">Affective</TabsTrigger>
                            <TabsTrigger value="comments">Comments</TabsTrigger>
                          </TabsList>

                          <TabsContent value="attendance" className="space-y-4 pt-3">
                            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              <span className="shrink-0 mt-0.5">ℹ</span>
                              <span><strong>Times School Opened</strong> must be entered manually (e.g. 120). The other three fields can be auto-filled from attendance records.</span>
                            </div>
                            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                              <NumInput label="Times School Opened  *" value={meta.times_school_opened}
                                onChange={v => setMeta(student.user_id, "times_school_opened", v)}
                                hint="Total school days this term. Enter manually." />
                            </div>
                            <Button variant="outline" size="sm" className="gap-2"
                              onClick={() => autoFillAttendance(student.user_id)}>
                              <RefreshCw className="h-3.5 w-3.5" />Auto-fill present / absent / punctual
                            </Button>
                            <div className="grid grid-cols-3 gap-3">
                              <NumInput label="Times Present"  value={meta.times_present}  onChange={v => setMeta(student.user_id, "times_present",  v)} />
                              <NumInput label="Times Absent"   value={meta.times_absent}   onChange={v => setMeta(student.user_id, "times_absent",   v)} />
                              <NumInput label="Times Punctual" value={meta.times_punctual} onChange={v => setMeta(student.user_id, "times_punctual", v)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Next Term Reopening Date</Label>
                              <Input type="date" value={meta.reopening_date || ""}
                                onChange={e => setMeta(student.user_id, "reopening_date", e.target.value || null)} />
                            </div>
                          </TabsContent>

                          <TabsContent value="psychomotor" className="pt-3">
                            <div className="rounded-lg border p-3 divide-y">
                              {PSYCHOMOTOR_FIELDS.map(({ key, label }) => (
                                <RatingSelector key={key} label={label} value={(pm as any)[key]}
                                  onChange={v => setPsychomotorMap(prev => ({ ...prev, [student.user_id]: { ...(prev[student.user_id] || {}), [key]: v } }))} />
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">6 = Excellent · 5 = Very Good · 4 = Good · 3 = Average · 2 = Below Average · 1 = Unsatisfactory</p>
                          </TabsContent>

                          <TabsContent value="affective" className="pt-3">
                            <div className="rounded-lg border p-3 divide-y">
                              {AFFECTIVE_FIELDS.map(({ key, label }) => (
                                <RatingSelector key={key} label={label} value={(af as any)[key]}
                                  onChange={v => setAffectiveMap(prev => ({ ...prev, [student.user_id]: { ...(prev[student.user_id] || {}), [key]: v } }))} />
                              ))}
                            </div>
                          </TabsContent>

                          <TabsContent value="comments" className="space-y-4 pt-3">
                            <div className="space-y-1.5">
                              <Label>Class Teacher's Comment</Label>
                              <Textarea placeholder="e.g. Has shown great improvement this term. Keep it up." rows={2}
                                value={meta.class_teacher_comment || ""}
                                onChange={e => setMeta(student.user_id, "class_teacher_comment", e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Principal's Comment</Label>
                              <Textarea placeholder="e.g. A commendable performance. Continue to strive for excellence." rows={2}
                                value={meta.principal_comment || ""}
                                onChange={e => setMeta(student.user_id, "principal_comment", e.target.value)} />
                            </div>
                          </TabsContent>
                        </Tabs>

                        <div className="flex justify-end mt-4">
                          <Button size="sm" className="gap-2" onClick={() => saveStudent(student)}
                            disabled={savingStudent === student.user_id}>
                            {savingStudent === student.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!previewStudent} onOpenChange={() => setPreviewStudent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Preview — {previewStudent?.full_name}</DialogTitle></DialogHeader>
          {previewStudent && (
            <ReportCard
              grades={gradesMap[previewStudent.user_id] || []}
              studentName={previewStudent.full_name}
              admissionNumber={previewStudent.username || undefined}
              className={classes.find(c => c.id === selectedClass)?.name}
              gender={previewStudent.gender || undefined}
              age={getAge(previewStudent.date_of_birth)}
              term={terms.find(t => t.id === selectedTerm)?.name}
              session={selectedSessionName}
              schoolName={schoolName} schoolLogoUrl={logoUrl || undefined}
              schoolAddress={schoolAddress || undefined} schoolContact={schoolContact || undefined}
              timesSchoolOpened={metadataMap[previewStudent.user_id]?.times_school_opened}
              timesPresent={metadataMap[previewStudent.user_id]?.times_present}
              timesAbsent={metadataMap[previewStudent.user_id]?.times_absent}
              timesPunctual={metadataMap[previewStudent.user_id]?.times_punctual}
              classPosition={metadataMap[previewStudent.user_id]?.class_position}
              totalStudents={metadataMap[previewStudent.user_id]?.total_students}
              classTeacherComment={metadataMap[previewStudent.user_id]?.class_teacher_comment}
              principalComment={metadataMap[previewStudent.user_id]?.principal_comment}
              reopeningDate={metadataMap[previewStudent.user_id]?.reopening_date}
              psychomotor={psychomotorMap[previewStudent.user_id]}
              affective={affectiveMap[previewStudent.user_id]}
              classAverages={classAverages} showPrintButton
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
