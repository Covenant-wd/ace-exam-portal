/**
 * InstructorAssignments
 *
 * Admin panel tab/dialog for assigning instructors to:
 *   - Specific subjects within a class  (Subject Instructor)
 *   - Classes as overall class managers (Class Instructor)
 *
 * Intended to be used inside the Instructors admin page as a
 * standalone dialog triggered from the action column, or embedded
 * as a separate tab.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, BookOpen, GraduationCap, X, Plus } from "lucide-react";

interface SubjectRow { id: string; name: string; }
interface ClassRow   { id: string; name: string; }

interface SubjectAssignment {
  id: string;
  subject_id: string;
  class_id: string;
  subject_name: string;
  class_name: string;
}

interface ClassAssignment {
  id: string;
  class_id: string;
  class_name: string;
}

interface Props {
  instructorId: string;
  instructorName: string;
  onClose?: () => void;
}

export default function InstructorAssignments({ instructorId, instructorName, onClose }: Props) {
  const { schoolId } = useAuth();

  const [classes,  setClasses]  = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  // Current assignments
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [classAssignments,   setClassAssignments]   = useState<ClassAssignment[]>([]);

  // "Add subject assignment" form state
  const [addSubjectClass,   setAddSubjectClass]   = useState("");
  const [addSubjectSubject, setAddSubjectSubject] = useState("");

  // Available subjects for the selected class (filtered by class_subjects)
  const [classSubjects, setClassSubjects] = useState<SubjectRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Fetch reference data + current assignments ───────────────────
  const fetchAll = async () => {
    if (!schoolId) return;
    setLoading(true);
    const [classesRes, subjectsRes, subjectAssRes, classAssRes] = await Promise.all([
      supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
      supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
      (supabase as any)
        .from("instructor_subjects")
        .select("id, subject_id, class_id, subjects:subject_id(name), classes:class_id(name)")
        .eq("instructor_id", instructorId)
        .eq("school_id", schoolId),
      (supabase as any)
        .from("class_instructors")
        .select("id, class_id, classes:class_id(name)")
        .eq("instructor_id", instructorId)
        .eq("school_id", schoolId),
    ]);

    setClasses(classesRes.data || []);
    setSubjects(subjectsRes.data || []);

    setSubjectAssignments(
      (subjectAssRes.data || []).map((r: any) => ({
        id:           r.id,
        subject_id:   r.subject_id,
        class_id:     r.class_id,
        subject_name: r.subjects?.name ?? "",
        class_name:   r.classes?.name  ?? "",
      }))
    );

    setClassAssignments(
      (classAssRes.data || []).map((r: any) => ({
        id:         r.id,
        class_id:   r.class_id,
        class_name: r.classes?.name ?? "",
      }))
    );

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [instructorId, schoolId]);

  // When the class filter changes in "Add subject", load that class's linked subjects
  useEffect(() => {
    if (!addSubjectClass) { setClassSubjects(subjects); return; }
    const load = async () => {
      const { data } = await supabase
        .from("class_subjects")
        .select("subject_id, subjects:subject_id(id, name)")
        .eq("class_id", addSubjectClass);
      const linked = (data || []).map((r: any) => r.subjects).filter(Boolean);
      setClassSubjects(linked.length > 0 ? linked : subjects);
    };
    load();
  }, [addSubjectClass, subjects]);

  // ── Subject assignment ───────────────────────────────────────────
  const handleAddSubject = async () => {
    if (!addSubjectClass || !addSubjectSubject) {
      toast.error("Select both a class and a subject");
      return;
    }
    // Check for duplicate
    if (subjectAssignments.some(a => a.subject_id === addSubjectSubject && a.class_id === addSubjectClass)) {
      toast.error("This subject+class combination is already assigned");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("instructor_subjects").insert({
      instructor_id: instructorId,
      subject_id:    addSubjectSubject,
      class_id:      addSubjectClass,
      school_id:     schoolId!,
    });
    if (error) toast.error(error.message);
    else { toast.success("Subject assigned"); setAddSubjectClass(""); setAddSubjectSubject(""); fetchAll(); }
    setSaving(false);
  };

  const handleRemoveSubject = async (id: string) => {
    setSaving(true);
    const { error } = await (supabase as any).from("instructor_subjects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); fetchAll(); }
    setSaving(false);
  };

  // ── Class instructor assignment ──────────────────────────────────
  const assignedClassIds = classAssignments.map(a => a.class_id);

  const handleToggleClass = async (classId: string, checked: boolean) => {
    setSaving(true);
    if (checked) {
      const { error } = await (supabase as any).from("class_instructors").insert({
        instructor_id: instructorId,
        class_id:      classId,
        school_id:     schoolId!,
      });
      if (error) toast.error(error.message);
      else { toast.success("Class assigned"); fetchAll(); }
    } else {
      const { error } = await (supabase as any)
        .from("class_instructors")
        .delete()
        .eq("instructor_id", instructorId)
        .eq("class_id", classId);
      if (error) toast.error(error.message);
      else { toast.success("Class removed"); fetchAll(); }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Assign roles for</p>
          <p className="font-semibold text-sm">{instructorName}</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs defaultValue="subject">
        <TabsList className="w-full">
          <TabsTrigger value="subject" className="flex-1 gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Subject Instructor
            {subjectAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">{subjectAssignments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="class" className="flex-1 gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            Class Instructor
            {classAssignments.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">{classAssignments.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Subject Instructor tab ─────────────────────────── */}
        <TabsContent value="subject" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Subject instructors can create exams, manage grades, upload questions,
            and review submissions for their assigned subjects.
          </p>

          {/* Current subject assignments */}
          {subjectAssignments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Assignments</Label>
              {subjectAssignments.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-black/5 dark:border-white/5 bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{a.subject_name}</p>
                    <p className="text-xs text-muted-foreground">{a.class_name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveSubject(a.id)}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Add new subject assignment */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Assignment</Label>
            <div className="space-y-2">
              <Label className="text-sm">Class</Label>
              <Select value={addSubjectClass} onValueChange={v => { setAddSubjectClass(v); setAddSubjectSubject(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Subject</Label>
              <Select value={addSubjectSubject} onValueChange={setAddSubjectSubject} disabled={!addSubjectClass}>
                <SelectTrigger>
                  <SelectValue placeholder={addSubjectClass ? "Select a subject…" : "Select class first"} />
                </SelectTrigger>
                <SelectContent>
                  {classSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full gap-2"
              onClick={handleAddSubject}
              disabled={saving || !addSubjectClass || !addSubjectSubject}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Subject Assignment
            </Button>
          </div>
        </TabsContent>

        {/* ── Class Instructor tab ───────────────────────────── */}
        <TabsContent value="class" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Class instructors manage attendance, send notifications, monitor students,
            and view overall class performance. A class can have multiple class instructors.
          </p>

          <div className="space-y-2">
            {classes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No classes created yet.</p>
            )}
            {classes.map(c => (
              <label
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-black/5 dark:border-white/5 bg-muted/30 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={assignedClassIds.includes(c.id)}
                  onCheckedChange={(checked) => handleToggleClass(c.id, !!checked)}
                  disabled={saving}
                />
                <div className="flex items-center gap-2 min-w-0">
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{c.name}</span>
                </div>
                {assignedClassIds.includes(c.id) && (
                  <Badge variant="default" className="ml-auto text-xs shrink-0">Assigned</Badge>
                )}
              </label>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
