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

  const { data: callerRole } = await supabaseAdmin.from("user_roles").select("role, school_id").eq("user_id", caller.id).single();
  if (!callerRole) return new Response(JSON.stringify({ error: "No role found" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const callerSchoolId = callerRole.school_id;
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "create") {
      const { email, password, full_name, username, child_ids } = body;

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, school_id: callerSchoolId },
      });
      if (createError) throw createError;

      await supabaseAdmin.from("profiles").update({
        full_name,
        first_name: full_name.split(" ")[0] || "",
        last_name: full_name.split(" ").slice(1).join(" ") || "",
        username: username || null,
        school_id: callerSchoolId,
      }).eq("user_id", newUser.user!.id);

      await supabaseAdmin.from("user_roles").update({
        role: "parent",
        school_id: callerSchoolId,
      }).eq("user_id", newUser.user!.id);

      if (child_ids && child_ids.length > 0) {
        const rows = child_ids.map((student_id: string) => ({
          parent_id: newUser.user!.id,
          student_id,
          school_id: callerSchoolId,
        }));
        await supabaseAdmin.from("parent_students").insert(rows);
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, email, password, full_name, username, child_ids } = body;

      const { data: parentRole } = await supabaseAdmin.from("user_roles").select("school_id").eq("user_id", user_id).single();
      if (parentRole?.school_id !== callerSchoolId) {
        return new Response(JSON.stringify({ error: "Parent does not belong to your school" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const authUpdate: Record<string, any> = {};
      if (email) authUpdate.email = email;
      if (password) authUpdate.password = password;
      if (Object.keys(authUpdate).length > 0) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, authUpdate);
      }

      const profileUpdate: Record<string, any> = {};
      if (full_name) {
        profileUpdate.full_name = full_name;
        profileUpdate.first_name = full_name.split(" ")[0] || "";
        profileUpdate.last_name = full_name.split(" ").slice(1).join(" ") || "";
      }
      if (username !== undefined) profileUpdate.username = username || null;
      if (Object.keys(profileUpdate).length > 0) {
        await supabaseAdmin.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }

      if (child_ids !== undefined) {
        await supabaseAdmin.from("parent_students").delete().eq("parent_id", user_id);
        if (child_ids.length > 0) {
          const rows = child_ids.map((student_id: string) => ({
            parent_id: user_id,
            student_id,
            school_id: callerSchoolId,
          }));
          await supabaseAdmin.from("parent_students").insert(rows);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      const { data: parentRole } = await supabaseAdmin.from("user_roles").select("school_id").eq("user_id", user_id).single();
      if (parentRole?.school_id !== callerSchoolId) {
        return new Response(JSON.stringify({ error: "Parent does not belong to your school" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "parent").eq("school_id", callerSchoolId);
      if (!roles || roles.length === 0) return new Response(JSON.stringify({ parents: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("user_id", userIds);
      const { data: links } = await supabaseAdmin.from("parent_students").select("parent_id, student_id").in("parent_id", userIds);
      const { data: studentProfiles } = await supabaseAdmin.from("profiles").select("user_id, full_name").eq("school_id", callerSchoolId);

      const parents = await Promise.all((profiles || []).map(async (p) => {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
        const children = (links || []).filter(l => l.parent_id === p.user_id).map(l => {
          const student = (studentProfiles || []).find(s => s.user_id === l.student_id);
          return { student_id: l.student_id, full_name: student?.full_name || "Unknown" };
        });
        return { ...p, email: user?.email || "", children };
      }));

      return new Response(JSON.stringify({ parents }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_children") {
      const { parent_id } = body;
      const { data: links } = await supabaseAdmin.from("parent_students").select("student_id").eq("parent_id", parent_id).eq("school_id", callerSchoolId);
      const studentIds = (links || []).map(l => l.student_id);
      return new Response(JSON.stringify({ child_ids: studentIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
