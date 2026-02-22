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

  useEffect(() => {
    document.title = schoolName;
  }, [schoolName]);

  return { schoolName, isLoading };
}

export function useSchoolLogo() {
  const { data: logoUrl = "", isLoading } = useQuery({
    queryKey: ["school_settings", "school_logo_url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("key", "school_logo_url")
        .single();
      if (error || !data) return "";
      return data.value || "";
    },
    staleTime: 5 * 60 * 1000,
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

export function useUpdateSchoolLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop();
      const fileName = `logo.${ext}`;

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

      // Save URL to settings
      const { error: settingsError } = await supabase
        .from("school_settings")
        .update({ value: publicUrl })
        .eq("key", "school_logo_url");
      if (settingsError) throw settingsError;

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}
