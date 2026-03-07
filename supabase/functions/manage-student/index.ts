import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is admin
  const authHeader = req.headers.get("Authorization")!;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  let isAuthorized = !!isAdmin;
  if (!isAuthorized) {
    const { data: isInstructor } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "instructor" });
    if (isInstructor) {
      const { data: perms } = await supabaseAdmin.from("instructor_permissions").select("can_manage_students").eq("instructor_id", caller.id).maybeSingle();
      if (perms?.can_manage_students) isAuthorized = true;
    }
  }
  if (!isAuthorized) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body = await req.json();
  const { action } = body;

  try {
    if (action === "create") {
      const { email, password, first_name, middle_name, last_name, username, class_id, date_of_birth, address, parent_name, nationality, subjects_offered, gender } = body;

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: `${first_name} ${last_name}` },
      });
      if (createError) throw createError;

      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        first_name, middle_name: middle_name || "", last_name, username: username || null,
        full_name: `${first_name} ${middle_name ? middle_name + " " : ""}${last_name}`,
        class_id: class_id || null,
        date_of_birth: date_of_birth || null,
        address: address || "",
        parent_name: parent_name || "", nationality: nationality || "",
        subjects_offered: subjects_offered || [],
        gender: gender || "",
      }).eq("user_id", newUser.user!.id);
      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, email, password, first_name, middle_name, last_name, username, class_id, date_of_birth, address, parent_name, nationality, subjects_offered, gender } = body;

      const authUpdate: Record<string, any> = {};
      if (email) authUpdate.email = email;
      if (password) authUpdate.password = password;
      if (Object.keys(authUpdate).length > 0) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
        if (error) throw error;
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        first_name, middle_name: middle_name || "", last_name, username: username || null,
        full_name: `${first_name} ${middle_name ? middle_name + " " : ""}${last_name}`,
        class_id: class_id || null,
        date_of_birth: date_of_birth || null,
        address: address || "",
        parent_name: parent_name || "", nationality: nationality || "",
        subjects_offered: subjects_offered || [],
        gender: gender || "",
      }).eq("user_id", user_id);
      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "student");
      if (!roles || roles.length === 0) return new Response(JSON.stringify({ students: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("user_id", userIds);

      const students = await Promise.all((profiles || []).map(async (p) => {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
        return { ...p, email: user?.email || "" };
      }));

      return new Response(JSON.stringify({ students }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
