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

  const authHeader = req.headers.get("Authorization")!;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Get caller's school_id
  const { data: callerRole } = await supabaseAdmin.from("user_roles").select("school_id").eq("user_id", caller.id).single();
  const callerSchoolId = callerRole?.school_id;

  const body = await req.json();
  const { action } = body;

  try {
    if (action === "create") {
      const { email, password, full_name } = body;

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, school_id: callerSchoolId },
      });
      if (createError) throw createError;

      await supabaseAdmin.from("profiles").update({
        full_name, first_name: full_name.split(" ")[0] || "",
        last_name: full_name.split(" ").slice(1).join(" ") || "",
        school_id: callerSchoolId,
      }).eq("user_id", newUser.user!.id);

      await supabaseAdmin.from("user_roles").update({ role: "instructor", school_id: callerSchoolId }).eq("user_id", newUser.user!.id);

      await supabaseAdmin.from("instructor_permissions").insert({
        instructor_id: newUser.user!.id, school_id: callerSchoolId,
      });

      return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, email, password, full_name } = body;

      // Verify instructor belongs to caller's school
      const { data: instrRole } = await supabaseAdmin.from("user_roles").select("school_id").eq("user_id", user_id).single();
      if (instrRole?.school_id !== callerSchoolId) {
        return new Response(JSON.stringify({ error: "Instructor does not belong to your school" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const authUpdate: Record<string, any> = {};
      if (email) authUpdate.email = email;
      if (password) authUpdate.password = password;
      if (Object.keys(authUpdate).length > 0) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
        if (error) throw error;
      }

      if (full_name) {
        await supabaseAdmin.from("profiles").update({
          full_name, first_name: full_name.split(" ")[0] || "",
          last_name: full_name.split(" ").slice(1).join(" ") || "",
        }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      // Verify instructor belongs to caller's school
      const { data: instrRole } = await supabaseAdmin.from("user_roles").select("school_id").eq("user_id", user_id).single();
      if (instrRole?.school_id !== callerSchoolId) {
        return new Response(JSON.stringify({ error: "Instructor does not belong to your school" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      // Only list instructors from caller's school
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "instructor").eq("school_id", callerSchoolId);
      if (!roles || roles.length === 0) return new Response(JSON.stringify({ instructors: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("user_id", userIds);
      const { data: permissions } = await supabaseAdmin.from("instructor_permissions").select("*").in("instructor_id", userIds);
      const { data: classes } = await supabaseAdmin.from("instructor_classes").select("*").in("instructor_id", userIds);

      const instructors = await Promise.all((profiles || []).map(async (p) => {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
        const perms = permissions?.find(perm => perm.instructor_id === p.user_id);
        const assignedClasses = classes?.filter(c => c.instructor_id === p.user_id).map(c => c.class_id) || [];
        return { ...p, email: user?.email || "", permissions: perms || null, assigned_classes: assignedClasses };
      }));

      return new Response(JSON.stringify({ instructors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_permissions") {
      const { instructor_id, can_manage_exams, can_view_results, can_manage_students, can_manage_subjects } = body;

      const { error } = await supabaseAdmin.from("instructor_permissions").upsert({
        instructor_id, school_id: callerSchoolId,
        can_manage_exams: can_manage_exams ?? false,
        can_view_results: can_view_results ?? false,
        can_manage_students: can_manage_students ?? false,
        can_manage_subjects: can_manage_subjects ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "instructor_id" });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "assign_classes") {
      const { instructor_id, class_ids } = body;

      await supabaseAdmin.from("instructor_classes").delete().eq("instructor_id", instructor_id);

      if (class_ids && class_ids.length > 0) {
        const rows = class_ids.map((class_id: string) => ({ instructor_id, class_id, school_id: callerSchoolId }));
        const { error } = await supabaseAdmin.from("instructor_classes").insert(rows);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
