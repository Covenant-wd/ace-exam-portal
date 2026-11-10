// src/hooks/useInAppCbt.ts
// Is the built-in CBT (teachers set exams, students take them in the portal) on for this school?
//
// Schools that use an EXTERNAL CBT portal (Settings → External CBT Portal) can keep it
// exactly as it is, so:
//   * no explicit choice + an external link is set  → built-in CBT stays OFF (nothing changes for them)
//   * no explicit choice + no external link         → built-in CBT is ON
//   * an admin can switch it ON or OFF in Settings  → that choice always wins
// Both can also run side by side: the external "CBT Portal" button is never touched.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const INAPP_CBT_KEY = "inapp_cbt_enabled";

export function useInAppCbt() {
  const { schoolId } = useAuth();

  // Same query key + function as useSchoolCbtLink(), so the cache is shared — but this one
  // also tells us when it is still loading (so the menu never flashes on and off).
  const { data: cbtLink = null, isLoading: linkLoading } = useQuery({
    queryKey: ["school_cbt_link", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase.from("schools").select("cbt_link").eq("id", schoolId).maybeSingle();
      return ((data as any)?.cbt_link as string | null) ?? null;
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,
  });

  const { data: explicit = null, isLoading: settingLoading } = useQuery({
    queryKey: ["school_settings", INAPP_CBT_KEY, schoolId],
    queryFn: async (): Promise<boolean | null> => {
      if (!schoolId) return null;
      const { data, error } = await supabase
        .from("school_settings")
        .select("value")
        .eq("school_id", schoolId)
        .eq("key", INAPP_CBT_KEY)
        .maybeSingle();
      if (error || !data) return null;
      if (data.value === "true") return true;
      if (data.value === "false") return false;
      return null;
    },
    enabled: !!schoolId,
    staleTime: 30 * 1000,
  });

  const isLoading = !schoolId || linkLoading || settingLoading;
  const enabled = !isLoading && (explicit ?? !cbtLink);

  return { enabled, explicit, isLoading, hasExternalLink: !!cbtLink, cbtLink };
}

export function useUpdateInAppCbt() {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!schoolId) throw new Error("No school ID available");
      const { error } = await supabase.rpc("upsert_school_setting", {
        _school_id: schoolId,
        _key: INAPP_CBT_KEY,
        _value: enabled ? "true" : "false",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school_settings"] });
    },
  });
}
