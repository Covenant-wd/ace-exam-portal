import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

const DEFAULT_SCHOOL_NAME = "CBT Portal";

export function useSchoolName() {
  const { data: schoolName = DEFAULT_SCHOOL_NAME, isLoading } = useQuery({
    queryKey: ["school_settings", "school_name"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("key", "school_name")
        .single();
      if (error || !data) return DEFAULT_SCHOOL_NAME;
      return data.value || DEFAULT_SCHOOL_NAME;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Update document title
  useEffect(() => {
    document.title = schoolName;
  }, [schoolName]);

  return { schoolName, isLoading };
}

export function useUpdateSchoolName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from("school_settings")
        .update({ value: newName })
        .eq("key", "school_name");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}
