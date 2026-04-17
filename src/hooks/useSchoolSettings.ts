import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

const DEFAULT_SCHOOL_NAME = "CBT Portal";

export function useSchoolName() {
  const { schoolId } = useAuth();
  const { data: schoolName = DEFAULT_SCHOOL_NAME, isLoading } = useQuery({
    queryKey: ["school_settings", "school_name", schoolId],
    queryFn: async () => {
      if (!schoolId) return DEFAULT_SCHOOL_NAME;
      
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("school_id", schoolId)
        .eq("key", "school_name")
        .single();
      if (error || !data) return DEFAULT_SCHOOL_NAME;
      return data.value || DEFAULT_SCHOOL_NAME;
    },
    staleTime: 30 * 1000,
    enabled: !!schoolId,
  });

  useEffect(() => {
    document.title = schoolName;
  }, [schoolName]);

  return { schoolName, isLoading };
}

export function useSchoolLogo() {
  const { schoolId } = useAuth();
  const { data: logoUrl = "", isLoading } = useQuery({
    queryKey: ["school_settings", "school_logo_url", schoolId],
    queryFn: async () => {
      if (!schoolId) return "";
      
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("school_id", schoolId)
        .eq("key", "school_logo_url")
        .single();
      if (error || !data) return "";
      return data.value || "";
    },
    staleTime: 30 * 1000,
    enabled: !!schoolId,
  });

  // Update favicon when logo changes
  useEffect(() => {
    if (logoUrl) {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement
        || document.createElement("link");
      link.rel = "icon";
      link.href = logoUrl;
      document.head.appendChild(link);
    }
  }, [logoUrl]);

  return { logoUrl, isLoading };
}

export function useUpdateSchoolName() {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newName: string) => {
      if (!schoolId) throw new Error("No school ID available");
      const { error } = await supabase
        .from("school_settings")
        .upsert(
          { school_id: schoolId, key: "school_name", value: newName },
          { onConflict: "school_id,key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}

export function useUpdateSchoolLogo() {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!schoolId) throw new Error("No school ID available");
      const ext = file.name.split(".").pop();
      const fileName = `${schoolId}/logo.${ext}`;

      // Upload to storage (overwrite existing)
      const { error: uploadError } = await supabase.storage
        .from("school-logo")
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("school-logo")
        .getPublicUrl(fileName);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Save URL to settings (upsert handles both new and existing rows)
      const { error: settingsError } = await supabase
        .from("school_settings")
        .upsert(
          { school_id: schoolId, key: "school_logo_url", value: publicUrl },
          { onConflict: "school_id,key" }
        );
      if (settingsError) throw settingsError;

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}
