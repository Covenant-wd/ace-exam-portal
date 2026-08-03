import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ──────────────────────────────────────────────────────────────────────────
// notify-implementation-request
//
// FIX: RequestDemoSection.tsx (the public "Book a Demo" form on the landing
// page) previously tried to notify Super Admins by querying `user_roles`
// and calling `get_user_emails_by_ids` directly from the browser. Both of
// those require the caller to already be an authenticated admin/super_admin
// (RLS on user_roles is `TO authenticated`, and get_user_emails_by_ids does
// its own auth.uid()-based role check). Since this form is filled out by
// anonymous site visitors (school owners who have never logged in), those
// calls always resolved to zero Super Admin emails and the notification
// was silently never sent.
//
// This edge function runs with the service-role key, so it can resolve
// Super Admin emails via get_user_emails_by_role() (service_role-only,
// no caller-auth requirement) regardless of who — if anyone — is logged
// into the browser that submitted the form, then emails them instantly.
// ──────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function infoBox(rows: { label: string; value: string }[]) {
  const cells = rows
    .map(
      (r) => `<li>${r.label}: <strong>${r.value}</strong></li>`
    )
    .join("");
  return `<ul style="margin: 10px 0; padding-left: 20px;">${cells}</ul>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[notify-implementation-request] invoked");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      schoolName,
      contactName,
      phone,
      email,
      schoolType,
      studentCount,
      location,
      servicesNeeded,
      message,
      bookVisit,
    } = body;

    if (!schoolName || !contactName || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: schoolName, contactName, email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: superAdminUsers, error: rpcError } = await supabaseAdmin
      .rpc("get_user_emails_by_role", { _role: "super_admin" })
      .limit(10);

    if (rpcError) {
      console.error("[notify-implementation-request] get_user_emails_by_role error:", rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const superAdminEmails = (superAdminUsers || []).map((u: any) => u.email).filter(Boolean);

    if (superAdminEmails.length === 0) {
      console.warn("[notify-implementation-request] No super admin emails found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No super admins to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notificationHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>New Implementation Request</h2>
        <p>A school has submitted an implementation / demo request on Academia HQ.</p>

        <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #007bff;">
          <p><strong>Request Details:</strong></p>
          ${infoBox([
            { label: "School Name", value: String(schoolName) },
            { label: "Contact Person", value: String(contactName) },
            { label: "Phone", value: String(phone ?? "") },
            { label: "Email", value: String(email) },
            { label: "School Type", value: String(schoolType ?? "") },
            { label: "No. of Students", value: String(studentCount ?? "") },
            { label: "Location", value: String(location ?? "") },
            { label: "Services Needed", value: Array.isArray(servicesNeeded) ? servicesNeeded.join(", ") : "Not specified" },
            { label: "Book Visit", value: bookVisit ? "Yes" : "No" },
          ])}
          ${message ? `<p><strong>Message:</strong> ${String(message)}</p>` : ""}
        </div>

        <p><strong>Next Step:</strong> Log in to the Super Admin panel to manage this request.</p>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          <p>© 2026 Academia HQ. All rights reserved.</p>
        </div>
      </div>
    `;

    const emailRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "x-email-invoke-secret": Deno.env.get("EMAIL_INVOKE_SECRET") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: superAdminEmails,
        subject: `New Implementation Request — ${schoolName}`,
        html: notificationHtml,
      }),
    });

    const emailData = await emailRes.json().catch(() => ({}));
    console.log("[notify-implementation-request] Notification sent to super admins", emailData);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[notify-implementation-request] Unhandled exception:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
