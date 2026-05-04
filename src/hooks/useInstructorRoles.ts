import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubjectAssignment {
  id: string;
  subject_id: string;
  subject_name: string;
  class_id: string;
  class_name: string;
  school_id: string;
}

export interface ClassAssignment {
  id: string;
  class_id: string;
  class_name: string;
  school_id: string;
}

export interface InstructorRoles {
  /** Subjects this instructor is assigned to teach */
  subjectAssignments: SubjectAssignment[];
  /** Classes this instructor manages (class instructor role) */
  classAssignments: ClassAssignment[];
  /** Whether the instructor has ANY subject assignment */
  isSubjectInstructor: boolean;
  /** Whether the instructor has ANY class instructor assignment */
  isClassInstructor: boolean;
  /** Quick lookup: is the instructor assigned to teach this subject (optionally in a specific class) */
  canManageSubject: (subjectId: string, classId?: string) => boolean;
  /** Quick lookup: is the instructor a class instructor for this class */
  canManageClass: (classId: string) => boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useInstructorRoles
 *
 * Fetches both subject-instructor and class-instructor assignments
 * for the currently authenticated instructor.
 *
 * Falls back gracefully — if a table doesn't exist yet (before migration
 * is run) the empty-array default is returned without throwing.
 */
export function useInstructorRoles() {
  const { user, role } = useAuth();
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || role !== "instructor") {
      setLoading(false);
      return;
    }

    const [subjectsRes, classesRes] = await Promise.allSettled([
      supabase
        .from("instructor_subjects")
        .select(`
          id,
          subject_id,
          class_id,
          school_id,
          subjects:subject_id(name),
          classes:class_id(name)
        `)
        .eq("instructor_id", user.id),
      supabase
        .from("class_instructors")
        .select(`
          id,
          class_id,
          school_id,
          classes:class_id(name)
        `)
        .eq("instructor_id", user.id),
    ]);

    if (subjectsRes.status === "fulfilled" && !subjectsRes.value.error) {
      const rows = (subjectsRes.value.data || []) as any[];
      setSubjectAssignments(
        rows.map((r) => ({
          id: r.id,
          subject_id: r.subject_id,
          subject_name: r.subjects?.name ?? "",
          class_id: r.class_id,
          class_name: r.classes?.name ?? "",
          school_id: r.school_id,
        }))
      );
    }

    if (classesRes.status === "fulfilled" && !classesRes.value.error) {
      const rows = (classesRes.value.data || []) as any[];
      setClassAssignments(
        rows.map((r) => ({
          id: r.id,
          class_id: r.class_id,
          class_name: r.classes?.name ?? "",
          school_id: r.school_id,
        }))
      );
    }

    setLoading(false);
  }, [user, role]);

  useEffect(() => { load(); }, [load]);

  const canManageSubject = useCallback(
    (subjectId: string, classId?: string) =>
      subjectAssignments.some(
        (a) =>
          a.subject_id === subjectId && (classId == null || a.class_id === classId)
      ),
    [subjectAssignments]
  );

  const canManageClass = useCallback(
    (classId: string) => classAssignments.some((a) => a.class_id === classId),
    [classAssignments]
  );

  const roles: InstructorRoles = {
    subjectAssignments,
    classAssignments,
    isSubjectInstructor: subjectAssignments.length > 0,
    isClassInstructor: classAssignments.length > 0,
    canManageSubject,
    canManageClass,
  };

  return { ...roles, loading, reload: load };
}
