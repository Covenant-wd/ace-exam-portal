// src/hooks/useProfileName.ts
// The name shown in the sidebar and in "Welcome, …" greetings.
//
// The login account stores the name it had when the account was created
// (user.user_metadata.full_name), and a signed-in browser keeps that copy until
// its session refreshes. When an admin or instructor edits a student's name, the
// profile record is updated immediately — so we read the name from the profile and
// only fall back to the login name while it loads (or if there is no profile name).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getFullName, getFirstName } from "@/lib/utils";

export function useProfileName() {
  const { user } = useAuth();
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    if (!user?.id) { setProfileName(""); return; }
    let alive = true;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfileName(((data as any)?.full_name || "").trim());
      });
    return () => { alive = false; };
  }, [user?.id]);

  const fullName = profileName || getFullName(user);
  const firstName = profileName ? profileName.split(/\s+/)[0] : getFirstName(user);
  return { fullName, firstName };
}
