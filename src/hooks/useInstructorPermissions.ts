import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useInstructorRoles } from "./useInstructorRoles";

export interface InstructorPermissions {
  can_manage_exams: boolean;
  can_view_results: boolean;
  can_manage_students: boolean;
  can_manage_subjects: boolean;
  can_mark_attendance: boolean;
  can_manage_grades: boolean;
  can_manage_timetable: boolean;
  can_manage_fees: boolean;
  can_post_announcements: boolean;
}

/**
 * useInstructorPermissions
 *
 * Returns the legacy flat permission flags AND the new role-based
 * helpers from useInstructorRoles, combined into one object.
 *
 * Callers that only use the legacy `permissions` field continue to
 * work unchanged.  New code can also use `canManageSubject` and
 * `canManageClass` for fine-grained checks.
 */
export function useInstructorPermissions() {
  const { user, role } = useAuth();
  const [permissions, setPermissions] = useState<InstructorPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  // New role assignments
  const roles = useInstructorRoles();

  useEffect(() => {
    if (!user || role !== "instructor") { setLoading(false); return; }
    supabase
      .from("instructor_permissions")
      .select("*")
      .eq("instructor_id", user.id)
      .single()
      .then(({ data }) => {
        setPermissions(data as InstructorPermissions | null);
        setLoading(false);
      });
  }, [user, role]);

  /**
   * Check if the instructor can manage a specific subject.
   * Checks BOTH the new instructor_subjects table (preferred)
   * AND the legacy can_manage_subjects flag.
   */
  const canAccessSubject = (subjectId: string, classId?: string): boolean => {
    if (roles.canManageSubject(subjectId, classId)) return true;
    return permissions?.can_manage_subjects ?? false;
  };

  /**
   * Check if the instructor can manage a specific class.
   * Checks BOTH the new class_instructors table (preferred)
   * AND the legacy can_mark_attendance flag (any class).
   */
  const canAccessClass = (classId: string): boolean => {
    if (roles.canManageClass(classId)) return true;
    return permissions?.can_mark_attendance ?? false;
  };

  return {
    permissions,
    loading: loading || roles.loading,
    // New role helpers
    subjectAssignments: roles.subjectAssignments,
    classAssignments: roles.classAssignments,
    isSubjectInstructor: roles.isSubjectInstructor,
    isClassInstructor: roles.isClassInstructor,
    canManageSubject: roles.canManageSubject,
    canManageClass: roles.canManageClass,
    // Combined helpers (legacy + new)
    canAccessSubject,
    canAccessClass,
  };
}
