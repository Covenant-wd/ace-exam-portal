import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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

export function useInstructorPermissions() {
  const { user, role } = useAuth();
  const [permissions, setPermissions] = useState<InstructorPermissions | null>(null);
  const [loading, setLoading] = useState(true);

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

  return { permissions, loading };
}
