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

  // Verify caller is super_admin
  const authHeader = req.headers.get("Authorization")!;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: caller.id, _role: "super_admin",
  });
  if (!isSuperAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { action } = body;

  try {
    if (action === "create") {
      const { school_id, email, password, full_name } = body;

      // Create user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, school_id },
      });
      if (createError) throw createError;

      // Update profile with school_id
      await supabaseAdmin.from("profiles").update({
        full_name,
        first_name: full_name.split(" ")[0] || "",
        last_name: full_name.split(" ").slice(1).join(" ") || "",
        school_id,
      }).eq("user_id", newUser.user!.id);

      // Set role to admin for this school (delete auto-created student role first)
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user!.id);
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUser.user!.id,
        role: "admin",
        school_id,
      });

      return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { school_id } = body;
      const { data: roles } = await supabaseAdmin.from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .eq("school_id", school_id);

      const admins = await Promise.all((roles || []).map(async (r) => {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        const { data: profile } = await supabaseAdmin.from("profiles")
          .select("*").eq("user_id", r.user_id).single();
        return { ...profile, email: user?.email || "" };
      }));

      return new Response(JSON.stringify({ admins }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
