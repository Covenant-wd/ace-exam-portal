// src/hooks/useAssignedClasses.ts
// The classes an instructor is assigned to (Assign Roles → Class Instructor).
// Used to scope class-based pages (attendance, announcements) to the
// instructor's own classes. Returns an empty list for non-instructors.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface AssignedClass { id: string; name: string; }

export function useAssignedClasses() {
  const { user, role } = useAuth();
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || role !== "instructor") { setClasses([]); setLoading(false); return; }
    let cancelled = false;
    (supabase as any)
      .from("class_instructors")
      .select("class_id, classes:class_id(id, name)")
      .eq("instructor_id", user.id)
      .then(({ data }: any) => {
        if (cancelled) return;
        const map = new Map<string, AssignedClass>();
        for (const r of (data || []) as any[]) {
          if (r.classes?.id) map.set(r.classes.id, { id: r.classes.id, name: r.classes.name });
        }
        setClasses(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, role]);

  return { classes, loading };
}
