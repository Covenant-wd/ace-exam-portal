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
    console.log("[handle-school-registration] invoked");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      email,
      school_name,
      contact_person,
      phone,
      address,
      website,
    } = body;

    // ──────────────────────────────────────────────────────────────────────
    // Validation
    // ──────────────────────────────────────────────────────────────────────

    if (!email || !school_name || !contact_person) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: email, school_name, contact_person",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Check if email already exists in requests
    // ──────────────────────────────────────────────────────────────────────

    const { data: existingReq, error: queryError } = await supabaseAdmin
      .from("school_registration_requests")
      .select("id, status")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (queryError && queryError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is expected
      console.error("[handle-school-registration] Query error:", queryError);
      return new Response(
        JSON.stringify({ error: "Database error during validation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (existingReq) {
      if (existingReq.status === "pending") {
        return new Response(
          JSON.stringify({
            error: "Your school registration is already pending approval",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (existingReq.status === "approved") {
        return new Response(
          JSON.stringify({
            error: "Your school is already registered. Please contact support if you need assistance.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If rejected, allow re-submission
      if (existingReq.status === "rejected") {
        console.log(
          `[handle-school-registration] Allowing re-submission for ${email}`
        );
        // Update existing rejection to pending
        const { error: updateError } = await supabaseAdmin
          .from("school_registration_requests")
          .update({
            status: "pending",
            requested_at: new Date().toISOString(),
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq("id", existingReq.id);

        if (updateError) {
          console.error("[handle-school-registration] Update error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to resubmit registration" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message:
              "Registration resubmitted. We will review it shortly.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Insert new registration request
    // ──────────────────────────────────────────────────────────────────────

    const { data: newRequest, error: insertError } = await supabaseAdmin
      .from("school_registration_requests")
      .insert({
        email: email.trim().toLowerCase(),
        school_name: school_name.trim(),
        contact_person: contact_person.trim(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        website: website?.trim() || null,
        status: "pending",
      })
      .select("id, email, school_name")
      .single();

    if (insertError) {
      console.error("[handle-school-registration] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit registration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // Send confirmation email to school
    // ──────────────────────────────────────────────────────────────────────

    const confirmationEmailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Registration Submitted Successfully</h2>
        <p>Dear <strong>${contact_person.trim()}</strong>,</p>
        <p>Thank you for registering <strong>${school_name.trim()}</strong> with Academia HQ.</p>
        <p>Your registration request has been submitted and is now pending review. Our team will verify your details and get back to you within 24-48 hours.</p>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #007bff;">
          <p><strong>Registration Details:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>School Name: ${school_name.trim()}</li>
            <li>Email: ${email.trim()}</li>
            <li>Contact Person: ${contact_person.trim()}</li>
            ${phone ? `<li>Phone: ${phone.trim()}</li>` : ""}
          </ul>
        </div>

        <p>Once approved, you will receive credentials to set up your admin account and access your school's dashboard.</p>
        
        <p style="margin-top: 30px;">
          <strong>Questions?</strong> Contact us at <a href="mailto:support@academiahq.digital">support@academiahq.digital</a>
        </p>

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
          to: email.trim().toLowerCase(),
          subject: "Academia HQ: School Registration Submitted",
          html: confirmationEmailHtml,
        }),
      });
      console.log("[handle-school-registration] Confirmation email sent to", email);
    } catch (emailError) {
      console.error(
        "[handle-school-registration] Failed to send confirmation email:",
        emailError
      );
      // Don't fail the registration just because email failed
    }

    // ──────────────────────────────────────────────────────────────────────
    // Notify super admin of new registration
    // ──────────────────────────────────────────────────────────────────────

    try {
      const { data: superAdminUsers } = await supabaseAdmin
        .rpc("get_user_emails_by_role", { _role: "super_admin" })
        .limit(10); // Get up to 10 super admins

      if (superAdminUsers && Array.isArray(superAdminUsers) && superAdminUsers.length > 0) {
        const superAdminEmails = superAdminUsers.map((u: any) => u.email);

        const notificationHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>New School Registration Request</h2>
            <p>A new school has registered and is awaiting approval.</p>
            
            <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #007bff;">
              <p><strong>Registration Details:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>School Name: <strong>${school_name.trim()}</strong></li>
                <li>Email: <strong>${email.trim()}</strong></li>
                <li>Contact Person: <strong>${contact_person.trim()}</strong></li>
                ${phone ? `<li>Phone: ${phone.trim()}</li>` : ""}
                ${address ? `<li>Address: ${address.trim()}</li>` : ""}
                ${website ? `<li>Website: ${website.trim()}</li>` : ""}
              </ul>
            </div>

            <p><strong>Next Step:</strong> Log in to your super admin dashboard to review and approve or reject this request.</p>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              <p>© 2026 Academia HQ. All rights reserved.</p>
            </div>
          </div>
        `;

        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "x-email-invoke-secret": Deno.env.get("EMAIL_INVOKE_SECRET") ?? "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: superAdminEmails,
              subject: `New School Registration: ${school_name.trim()}`,
              html: notificationHtml,
            }),
          }
        );
        console.log(
          "[handle-school-registration] Notification sent to super admins"
        );
      }
    } catch (notifyError) {
      console.error(
        "[handle-school-registration] Failed to notify super admins:",
        notifyError
      );
      // Don't fail the registration if notification fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Registration submitted successfully. We will review your application and contact you within 24-48 hours.",
        registration_id: newRequest?.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[handle-school-registration] Unhandled exception:", err?.message);
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
