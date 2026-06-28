import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[approve-school-registration] invoked");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ──────────────────────────────────────────────────────────────────────
    // Verify caller is super_admin
    // ──────────────────────────────────────────────────────────────────────

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const { action, registration_id, rejection_reason, admin_email, admin_password } = body;

    // ──────────────────────────────────────────────────────────────────────
    // ACTION: APPROVE
    // ──────────────────────────────────────────────────────────────────────

    if (action === "approve") {
      if (!registration_id || !admin_email || !admin_password) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: registration_id, admin_email, admin_password",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fetch the registration request
      const { data: req_data, error: reqError } = await supabaseAdmin
        .from("school_registration_requests")
        .select("*")
        .eq("id", registration_id)
        .single();

      if (reqError || !req_data) {
        return new Response(
          JSON.stringify({ error: "Registration request not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (req_data.status !== "pending") {
        return new Response(
          JSON.stringify({
            error: `Registration is not pending (status: ${req_data.status})`,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Step 1: Approve the registration via SQL function
      const { data: approvalResult, error: approvalError } = await supabaseAdmin.rpc(
        "approve_school_registration",
        {
          _req_id: registration_id,
          _reviewed_by: caller.id,
        }
      );

      if (approvalError) {
        console.error("[approve-school-registration] Approval error:", approvalError);
        return new Response(
          JSON.stringify({ error: approvalError.message || "Failed to approve registration" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const school_id = approvalResult?.[0]?.school_id;
      const school_slug = approvalResult?.[0]?.school_slug;

      if (!school_id || !school_slug) {
        return new Response(
          JSON.stringify({ error: "School creation failed" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Step 2: Create school admin auth account
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: admin_email.trim().toLowerCase(),
        password: admin_password,
        email_confirm: true,
        user_metadata: {
          full_name: req_data.contact_person,
          school_id,
          school_name: req_data.school_name,
        },
      });

      if (createError) {
        console.error("[approve-school-registration] User creation error:", createError);
        return new Response(
          JSON.stringify({ error: createError.message || "Failed to create admin account" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const admin_user_id = newUser.user!.id;

      // Step 3: Update profile with school_id
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name: req_data.contact_person,
          school_id,
        })
        .eq("user_id", admin_user_id);

      if (profileError) {
        console.error("[approve-school-registration] Profile update error:", profileError);
      }

      // Step 4: Delete auto-created student role and set admin role
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", admin_user_id);

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: admin_user_id,
        role: "admin",
        school_id,
      });

      if (roleError) {
        console.error("[approve-school-registration] Role assignment error:", roleError);
      }

      // Step 5: Create school_admins mapping
      const { error: mappingError } = await supabaseAdmin.from("school_admins").insert({
        school_id,
        user_id: admin_user_id,
      });

      if (mappingError) {
        console.error("[approve-school-registration] School admin mapping error:", mappingError);
      }

      // Step 6: Send approval email to school
      const approvalEmailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Your School Registration is Approved! 🎉</h2>
          <p>Dear <strong>${req_data.contact_person}</strong>,</p>
          <p>Great news! Your school <strong>${req_data.school_name}</strong> has been approved and is now active on Academia HQ.</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #d4edda; border-left: 4px solid #28a745; border-radius: 4px;">
            <p><strong style="color: #155724;">Your School Portal is Ready</strong></p>
            <p>Login URL: <code style="background-color: #fff; padding: 2px 6px; border-radius: 3px;">/school/${school_slug}</code></p>
          </div>

          <h3>Admin Account Credentials</h3>
          <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #007bff; border-radius: 4px;">
            <p><strong>Email:</strong> ${admin_email.trim().toLowerCase()}</p>
            <p><strong>Password:</strong> Use the password you provided during registration</p>
            <p><em>⚠️ Please change your password on first login</em></p>
          </div>

          <h3>Next Steps</h3>
          <ol style="margin: 15px 0; padding-left: 20px;">
            <li>Visit your school portal: <a href="https://academiahq.digital/school/${school_slug}">/school/${school_slug}</a></li>
            <li>Log in with your admin credentials</li>
            <li>Update your school settings (logo, contact info, etc.)</li>
            <li>Add instructors, classes, and students</li>
            <li>Create your first exam</li>
          </ol>

          <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 4px;">
            <p><strong>Need Help?</strong></p>
            <p>Contact us at <a href="mailto:support@academiahq.digital">support@academiahq.digital</a></p>
            <p>WhatsApp: <a href="https://wa.me/2349039580317">+234-903-958-0317</a></p>
          </div>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p>© 2026 Academia HQ. All rights reserved.</p>
          </div>
        </div>
      `;

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "x-email-invoke-secret": Deno.env.get("EMAIL_INVOKE_SECRET") ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: req_data.email,
            subject: `Welcome! ${req_data.school_name} is Approved`,
            html: approvalEmailHtml,
          }),
        });
        console.log("[approve-school-registration] Approval email sent to", req_data.email);
      } catch (emailError) {
        console.error("[approve-school-registration] Failed to send approval email:", emailError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "School registration approved successfully",
          school_id,
          school_slug,
          admin_user_id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // ACTION: REJECT
    // ──────────────────────────────────────────────────────────────────────

    if (action === "reject") {
      if (!registration_id || !rejection_reason) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: registration_id, rejection_reason",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fetch the registration request
      const { data: req_data, error: reqError } = await supabaseAdmin
        .from("school_registration_requests")
        .select("*")
        .eq("id", registration_id)
        .single();

      if (reqError || !req_data) {
        return new Response(
          JSON.stringify({ error: "Registration request not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (req_data.status !== "pending") {
        return new Response(
          JSON.stringify({
            error: `Registration is not pending (status: ${req_data.status})`,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Call SQL function to reject
      const { error: rejectError } = await supabaseAdmin.rpc(
        "reject_school_registration",
        {
          _req_id: registration_id,
          _reviewed_by: caller.id,
          _rejection_reason: rejection_reason.trim(),
        }
      );

      if (rejectError) {
        console.error("[approve-school-registration] Rejection error:", rejectError);
        return new Response(
          JSON.stringify({ error: rejectError.message || "Failed to reject registration" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Send rejection email
      const rejectionEmailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>School Registration - Status Update</h2>
          <p>Dear <strong>${req_data.contact_person}</strong>,</p>
          <p>Thank you for your interest in Academia HQ. After careful review, we are unable to approve your school registration at this time.</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
            <p><strong style="color: #721c24;">Reason for Rejection:</strong></p>
            <p style="white-space: pre-wrap;">${rejection_reason.trim()}</p>
          </div>

          <h3>Next Steps</h3>
          <p>If you have questions about this decision or would like to resubmit your application with corrections, please contact us.</p>

          <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 4px;">
            <p><strong>Questions?</strong></p>
            <p>Contact us at <a href="mailto:support@academiahq.digital">support@academiahq.digital</a></p>
            <p>WhatsApp: <a href="https://wa.me/2349039580317">+234-903-958-0317</a></p>
          </div>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p>© 2026 Academia HQ. All rights reserved.</p>
          </div>
        </div>
      `;

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "x-email-invoke-secret": Deno.env.get("EMAIL_INVOKE_SECRET") ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: req_data.email,
            subject: "School Registration - Update",
            html: rejectionEmailHtml,
          }),
        });
        console.log("[approve-school-registration] Rejection email sent to", req_data.email);
      } catch (emailError) {
        console.error("[approve-school-registration] Failed to send rejection email:", emailError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Registration rejected successfully",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'approve' or 'reject'" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[approve-school-registration] Unhandled exception:", err?.message);
    return new Response(
      JSON.stringify({
        error: err?.message ?? "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
