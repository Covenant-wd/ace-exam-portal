import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendGradesPublishedEmail, isNotificationEnabled } from "@/lib/email";
import { useSchoolName } from "@/hooks/useSchoolSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, Award, Pencil, Eye } from "lucide-react";
import ReportCard from "@/components/ReportCard";

interface GradeCategory { id: string; name: string; weight: number; max_score: number; term_id: string | null; }
interface ClassItem { id: string; name: string; }
interface Subject { id: string; name: string; }
interface Term { id: string; name: string; session_id: string; }
interface StudentProfile { user_id: string; full_name: string; class_id: string | null; }

export default function Grades() {
  const { user, schoolId } = useAuth();
  const { schoolName } = useSchoolName();
  const [classes, setClasses]     = useState<ClassItem[]>([]);
  const [subjects, setSubjects]   = useState<Subject[]>([]);
  const [terms, setTerms]         = useState<Term[]>([]);
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [students, setStudents]   = useState<StudentProfile[]>([]);
  const [loading, setLoading]     = useState(true);

  // Enter Scores
  const [selectedClass, setSelectedClass]       = useState("");
  const [selectedSubject, setSelectedSubject]   = useState("");
  const [selectedTerm, setSelectedTerm]         = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [grades, setGrades]   = useState<Map<string, number>>(new Map());
  const [saving, setSaving]   = useState(false);

  // Report Card
  const [reportClass, setReportClass]     = useState("");
  const [reportTerm, setReportTerm]       = useState("");
  const [reportStudent, setReportStudent] = useState("");
  const [reportStudents, setReportStudents] = useState<StudentProfile[]>([]);
  const [allGrades, setAllGrades]         = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Category dialog
  const [catDialog, setCatDialog]     = useState(false);
  const [editingCat, setEditingCat]   = useState<GradeCategory | null>(null);
  const [catName, setCatName]         = useState("");
  const [catWeight, setCatWeight]     = useState("100");
  const [catMaxScore, setCatMaxScore] = useState("100");
  const [catSaving, setCatSaving]     = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const init = async () => {
      const [classRes, subjectRes, termRes, catRes] = await Promise.all([
        supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("terms").select("id, name, session_id").eq("school_id", schoolId).order("name"),
        supabase.from("grade_categories").select("*").eq("school_id", schoolId).order("name"),
      ]);
      setClasses((classRes.data as ClassItem[]) || []);
      setSubjects((subjectRes.data as Subject[]) || []);
      setTerms((termRes.data as Term[]) || []);
      setCategories((catRes.data as GradeCategory[]) || []);
      setLoading(false);
    };
    init();
  }, [schoolId]);

  // Load students when class changes (Enter Scores tab)
  useEffect(() => {
    if (!selectedClass || !schoolId) { setStudents([]); return; }
    supabase.rpc("get_school_students_only", { _school_id: schoolId }).then(({ data }) => {
      const filtered = ((data as any[]) || [])
        .filter((s: any) => s.class_id === selectedClass)
        .map((s: any) => ({ user_id: s.user_id, full_name: s.full_name, class_id: s.class_id }));
      setStudents(filtered as StudentProfile[]);
    });
  }, [selectedClass, schoolId]);

  // Load students when report class changes
  useEffect(() => {
    if (!reportClass || !schoolId) { setReportStudents([]); setReportStudent(""); return; }
    supabase.rpc("get_school_students_only", { _school_id: schoolId }).then(({ data }) => {
      const filtered = ((data as any[]) || [])
        .filter((s: any) => s.class_id === reportClass)
        .map((s: any) => ({ user_id: s.user_id, full_name: s.full_name, class_id: s.class_id }));
      setReportStudents(filtered as StudentProfile[]);
    });
  }, [reportClass, schoolId]);

  // Load grades for Enter Scores
  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedTerm || !selectedCategory) { setGrades(new Map()); return; }
    supabase.from("grades").select("student_id, score")
      .eq("class_id", selectedClass).eq("subject_id", selectedSubject)
      .eq("term_id", selectedTerm).eq("category_id", selectedCategory)
      .then(({ data }) => {
        const map = new Map<string, number>();
        (data || []).forEach((g: any) => map.set(g.student_id, g.score));
        setGrades(map);
      });
  }, [selectedClass, selectedSubject, selectedTerm, selectedCategory]);

  const activeCategoryMaxScore = categories.find(c => c.id === selectedCategory)?.max_score ?? 100;

  const loadAllGradesForStudent = async (studentId: string) => {
    if (!studentId || !reportClass || !reportTerm || !schoolId) return;
    setLoadingReport(true);
    const { data } = await supabase.from("grades")
      .select("score, max_score, subjects:subject_id(name), grade_categories:category_id(name, max_score)")
      .eq("student_id", studentId)
      .eq("class_id", reportClass)
      .eq("term_id", reportTerm)
      .eq("school_id", schoolId);
    setAllGrades((data || []).map((g: any) => ({
      subject_name: g.subjects?.name || "—",
      category_name: g.grade_categories?.name || "—",
      category_max_score: g.grade_categories?.max_score ?? g.max_score,
      score: g.score,
    })));
    setLoadingReport(false);
  };

  const handleSaveGrades = async () => {
    if (!schoolId || !user) return;
    const invalid = students.find(s => (grades.get(s.user_id) ?? 0) > activeCategoryMaxScore);
    if (invalid) { toast.error(`Score cannot exceed the obtainable mark of ${activeCategoryMaxScore}`); return; }
    setSaving(true);
    try {
      await supabase.from("grades").delete()
        .eq("class_id", selectedClass).eq("subject_id", selectedSubject)
        .eq("term_id", selectedTerm).eq("category_id", selectedCategory);
      const { error } = await supabase.from("grades").insert(
        students.map(s => ({
          student_id: s.user_id, subject_id: selectedSubject, class_id: selectedClass,
          term_id: selectedTerm, school_id: schoolId, category_id: selectedCategory,
          score: grades.get(s.user_id) ?? 0, max_score: activeCategoryMaxScore, graded_by: user.id,
        })) as any
      );
      if (error) throw error;
      toast.success("Grades saved successfully");
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const openNewCategory = () => {
    setEditingCat(null); setCatName(""); setCatWeight("100"); setCatMaxScore("100");
    setCatDialog(true);
  };
  const openEditCategory = (cat: GradeCategory) => {
    setEditingCat(cat); setCatName(cat.name);
    setCatWeight(String(cat.weight)); setCatMaxScore(String(cat.max_score));
    setCatDialog(true);
  };
  const refreshCategories = async () => {
    const { data } = await supabase.from("grade_categories").select("*").eq("school_id", schoolId!).order("name");
    setCategories((data as GradeCategory[]) || []);
  };
  const handleSaveCategory = async () => {
    if (!catName.trim() || !schoolId) { toast.error("Name required"); return; }
    const maxScore = parseFloat(catMaxScore);
    const weight = parseFloat(catWeight);
    if (isNaN(maxScore) || maxScore <= 0) { toast.error("Obtainable mark must be > 0"); return; }
    if (isNaN(weight) || weight <= 0) { toast.error("Weight must be > 0"); return; }
    setCatSaving(true);
    try {
      if (editingCat) {
        const { error } = await supabase.from("grade_categories")
          .update({ name: catName.trim(), weight, max_score: maxScore } as any).eq("id", editingCat.id);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("grade_categories").insert({
          school_id: schoolId, name: catName.trim(), weight, max_score: maxScore,
          term_id: selectedTerm || null,
        } as any);
        if (error) throw error;
        toast.success("Category created");
      }
      setCatDialog(false);
      await refreshCategories();
    } catch (err: any) { toast.error(err.message); }
    setCatSaving(false);
  };
  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? All grades in it will also be deleted.")) return;
    await supabase.from("grades").delete().eq("category_id", id);
    await supabase.from("grade_categories").delete().eq("id", id);
    setCategories(categories.filter(c => c.id !== id));
    if (selectedCategory === id) setSelectedCategory("");
    toast.success("Category deleted");
  };
  const setScore = (studentId: string, value: string) => {
    const score = parseFloat(value);
    const newGrades = new Map(grades);
    newGrades.set(studentId, isNaN(score) ? 0 : Math.min(score, activeCategoryMaxScore));
    setGrades(newGrades);
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const totalMaxScore = categories.reduce((sum, c) => sum + Number(c.max_score), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grades & Report Cards</h1>
        <p className="text-muted-foreground">Manage grade categories and enter student scores</p>
      </div>

      {/* Grade Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Grade Categories</CardTitle>
            {categories.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                Total obtainable: <span className="font-semibold text-foreground">{totalMaxScore} marks</span>
              </p>
            )}
          </div>
          <Button size="sm" onClick={openNewCategory}><Plus className="mr-1 h-4 w-4" />Add Category</Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No categories yet. Create categories like "First CA" (30 marks), "Exam" (70 marks).
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs"><Award className="h-3 w-3 mr-1" />{c.max_score} marks</Badge>
                      <span className="text-xs text-muted-foreground">Weight: {c.weight}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCategory(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCategory(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scores + Report Card — Tabs wraps the whole card */}
      <Tabs defaultValue="enter">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Scores & Report Card</CardTitle>
            <TabsList>
              <TabsTrigger value="enter"><Save className="h-3.5 w-3.5 mr-1.5" />Enter Scores</TabsTrigger>
              <TabsTrigger value="report"><Eye className="h-3.5 w-3.5 mr-1.5" />Report Card</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Enter Scores Tab ── */}
            <TabsContent value="enter" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                  <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                  <SelectContent>{terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.max_score} marks)</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {selectedCategory && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5">
                  <Award className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm">
                    Obtainable: <strong>{categories.find(c => c.id === selectedCategory)?.name}</strong>{" — "}
                    <strong className="text-primary">{activeCategoryMaxScore} marks max</strong>
                  </p>
                </div>
              )}

              {selectedClass && selectedSubject && selectedTerm && selectedCategory && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Score (out of {activeCategoryMaxScore})</TableHead>
                        <TableHead className="w-20">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No students in this class</TableCell></TableRow>
                      ) : students.map((s, i) => {
                        const score = grades.get(s.user_id) ?? 0;
                        const pct = activeCategoryMaxScore > 0 ? Math.round((score / activeCategoryMaxScore) * 100) : 0;
                        return (
                          <TableRow key={s.user_id}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{s.full_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input type="number" min="0" max={activeCategoryMaxScore}
                                  value={grades.get(s.user_id) ?? ""}
                                  onChange={e => setScore(s.user_id, e.target.value)}
                                  className="w-24" placeholder="0" />
                                <span className="text-sm text-muted-foreground">/ {activeCategoryMaxScore}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={pct >= 50 ? "default" : "destructive"} className="text-xs">{pct}%</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {students.length > 0 && (
                    <Button onClick={handleSaveGrades} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Grades
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Report Card Tab ── */}
            <TabsContent value="report" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Select value={reportClass} onValueChange={setReportClass}>
                  <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={reportTerm} onValueChange={setReportTerm}>
                  <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                  <SelectContent>{terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={reportStudent} onValueChange={v => { setReportStudent(v); loadAllGradesForStudent(v); }}>
                  <SelectTrigger><SelectValue placeholder="Student" /></SelectTrigger>
                  <SelectContent>
                    {reportStudents.length === 0
                      ? <SelectItem value="_" disabled>Select a class first</SelectItem>
                      : reportStudents.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>

              {loadingReport ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : reportStudent ? (
                <ReportCard
                  grades={allGrades}
                  studentName={reportStudents.find(s => s.user_id === reportStudent)?.full_name}
                  term={terms.find(t => t.id === reportTerm)?.name}
                />
              ) : (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Select class, term and a student to view their report card
                </div>
              )}
            </TabsContent>

          </CardContent>
        </Card>
      </Tabs>

      {/* Add/Edit Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCat ? "Edit Grade Category" : "Add Grade Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Category Name *</Label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="e.g. First CA, Second CA, Exam" />
            </div>
            <div className="space-y-2">
              <Label>Obtainable Mark *</Label>
              <Input type="number" min="1" value={catMaxScore} onChange={e => setCatMaxScore(e.target.value)} placeholder="e.g. 30" />
              <p className="text-xs text-muted-foreground">Max score a student can get (e.g. 30 for CA, 70 for Exam)</p>
            </div>
            <div className="space-y-2">
              <Label>Weight (%) *</Label>
              <Input type="number" min="1" max="100" value={catWeight} onChange={e => setCatWeight(e.target.value)} placeholder="e.g. 30" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCatDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveCategory} disabled={catSaving} className="flex-1">
                {catSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCat ? "Update" : "Create"} Category
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
