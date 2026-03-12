import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

interface GradeCategory {
  id: string;
  name: string;
  weight: number;
  term_id: string | null;
}

interface ClassItem { id: string; name: string; }
interface Subject { id: string; name: string; }
interface Term { id: string; name: string; session_id: string; }
interface StudentProfile { user_id: string; full_name: string; class_id: string | null; }

interface GradeEntry {
  student_id: string;
  score: number;
}

export default function Grades() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const [grades, setGrades] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);

  // Category dialog
  const [catDialog, setCatDialog] = useState(false);
  const [catName, setCatName] = useState("");
  const [catWeight, setCatWeight] = useState("100");
  const [catSaving, setCatSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [classRes, subjectRes, termRes] = await Promise.all([
        supabase.from("classes").select("id, name").order("name"),
        supabase.from("subjects").select("id, name").order("name"),
        supabase.from("terms").select("id, name, session_id").order("name"),
      ]);
      setClasses((classRes.data as ClassItem[]) || []);
      setSubjects((subjectRes.data as Subject[]) || []);
      setTerms((termRes.data as Term[]) || []);

      if (user) {
        const { data: profile } = await supabase.from("profiles").select("school_id").eq("user_id", user.id).single();
        if (profile?.school_id) {
          setSchoolId(profile.school_id);
          const { data: catData } = await supabase.from("grade_categories").select("*").eq("school_id", profile.school_id).order("name");
          setCategories((catData as GradeCategory[]) || []);
        }
      }
      setLoading(false);
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!selectedClass) { setStudents([]); return; }
    supabase.from("profiles").select("user_id, full_name, class_id").eq("class_id", selectedClass).order("full_name")
      .then(({ data }) => setStudents((data as StudentProfile[]) || []));
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedTerm || !selectedCategory) { setGrades(new Map()); return; }
    loadGrades();
  }, [selectedClass, selectedSubject, selectedTerm, selectedCategory]);

  const loadGrades = async () => {
    const { data } = await supabase.from("grades").select("student_id, score")
      .eq("class_id", selectedClass).eq("subject_id", selectedSubject)
      .eq("term_id", selectedTerm).eq("category_id", selectedCategory);
    const map = new Map<string, number>();
    (data || []).forEach((g: any) => map.set(g.student_id, g.score));
    setGrades(map);
  };

  const handleSaveGrades = async () => {
    if (!schoolId || !user) return;
    setSaving(true);
    try {
      // Delete existing grades for this combination
      await supabase.from("grades").delete()
        .eq("class_id", selectedClass).eq("subject_id", selectedSubject)
        .eq("term_id", selectedTerm).eq("category_id", selectedCategory);

      const inserts = students.map((s) => ({
        student_id: s.user_id,
        subject_id: selectedSubject,
        class_id: selectedClass,
        term_id: selectedTerm,
        school_id: schoolId,
        category_id: selectedCategory,
        score: grades.get(s.user_id) || 0,
        max_score: 100,
        graded_by: user.id,
      }));

      const { error } = await supabase.from("grades").insert(inserts as any);
      if (error) throw error;
      toast.success("Grades saved successfully");
    } catch (err: any) { toast.error(err.message); }
    setSaving(false);
  };

  const handleSaveCategory = async () => {
    if (!catName || !schoolId) return;
    setCatSaving(true);
    try {
      const { error } = await supabase.from("grade_categories").insert({
        school_id: schoolId, name: catName, weight: parseFloat(catWeight) || 100,
        term_id: selectedTerm || null,
      } as any);
      if (error) throw error;
      toast.success("Category created");
      setCatDialog(false); setCatName(""); setCatWeight("100");
      const { data } = await supabase.from("grade_categories").select("*").eq("school_id", schoolId).order("name");
      setCategories((data as GradeCategory[]) || []);
    } catch (err: any) { toast.error(err.message); }
    setCatSaving(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this grade category?")) return;
    await supabase.from("grade_categories").delete().eq("id", id);
    setCategories(categories.filter((c) => c.id !== id));
    toast.success("Category deleted");
  };

  const setScore = (studentId: string, score: number) => {
    const newGrades = new Map(grades);
    newGrades.set(studentId, score);
    setGrades(newGrades);
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Grades & Report Cards</h1>
        <p className="text-muted-foreground">Manage grade categories and enter student scores</p>
      </div>

      {/* Grade Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Grade Categories</CardTitle>
          <Button size="sm" onClick={() => setCatDialog(true)}><Plus className="mr-1 h-4 w-4" /> Add Category</Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No grade categories. Create categories like "First CA", "Second CA", "Exam".</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground">({c.weight}%)</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteCategory(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Entry */}
      <Card>
        <CardHeader><CardTitle>Enter Scores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedTerm} onValueChange={setSelectedTerm}>
              <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent>{terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {selectedClass && selectedSubject && selectedTerm && selectedCategory && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-32">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No students</TableCell></TableRow>
                  ) : (
                    students.map((s, i) => (
                      <TableRow key={s.user_id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number" min="0" max="100"
                            value={grades.get(s.user_id) ?? ""}
                            onChange={(e) => setScore(s.user_id, parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
        </CardContent>
      </Card>

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Grade Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Category Name</Label><Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. First CA, Exam" /></div>
            <div className="space-y-2"><Label>Weight (%)</Label><Input type="number" value={catWeight} onChange={(e) => setCatWeight(e.target.value)} placeholder="100" /></div>
            <Button onClick={handleSaveCategory} disabled={catSaving} className="w-full">{catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Category"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
