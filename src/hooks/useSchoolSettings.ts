import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

const DEFAULT_SCHOOL_NAME = "Academia HQ";

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

  useEffect(() => {
    if (logoUrl) {
      const link =
        (document.querySelector("link[rel='icon']") as HTMLLinkElement) ||
        document.createElement("link");
      link.rel = "icon";
      link.href = logoUrl;
      document.head.appendChild(link);
    }
  }, [logoUrl]);

  return { logoUrl, isLoading };
}

/**
 * Reads the school's external CBT portal URL (stored in the `schools.cbt_link`
 * column, which already exists in the DB schema).
 * Returns null when no link is configured — callers should hide CBT UI in that case.
 */
export function useSchoolCbtLink() {
  const { schoolId } = useAuth();
  const { data: cbtLink = null } = useQuery({
    queryKey: ["school_cbt_link", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase
        .from("schools")
        .select("cbt_link")
        .eq("id", schoolId)
        .single();
      return (data?.cbt_link as string | null) ?? null;
    },
    staleTime: 60 * 1000,
    enabled: !!schoolId,
  });

  return { cbtLink };
}

// ─── Shared helper ────────────────────────────────────────────────────────────
async function upsertSetting(schoolId: string, key: string, value: string) {
  const { error } = await supabase.rpc("upsert_school_setting", {
    _school_id: schoolId,
    _key: key,
    _value: value,
  });
  if (error) throw error;
}

export function useUpdateSchoolName() {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newName: string) => {
      if (!schoolId) throw new Error("No school ID available");
      await upsertSetting(schoolId, "school_name", newName);
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

      const { error: uploadError } = await supabase.storage
        .from("school-logo")
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("school-logo")
        .getPublicUrl(fileName);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await upsertSetting(schoolId, "school_logo_url", publicUrl);

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}

export function useUpdateCbtLink() {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      if (!schoolId) throw new Error("No school ID available");
      const { error } = await supabase
        .from("schools")
        .update({ cbt_link: url || null })
        .eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_cbt_link"] });
    },
  });
}
