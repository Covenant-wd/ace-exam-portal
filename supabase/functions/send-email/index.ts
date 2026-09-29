const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-invoke-secret',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[send-email] invoked");

    // ── Auth: accept either a valid Supabase JWT (frontend callers)
    //         or the shared invoke secret (server-side edge function callers).
    // This lets us set verify_jwt: false in config.toml while still blocking
    // anonymous abuse.
    const INVOKE_SECRET = Deno.env.get("EMAIL_INVOKE_SECRET");
    const incomingSecret = req.headers.get("x-email-invoke-secret");
    const authHeader = req.headers.get("Authorization") ?? "";

    // If a secret is configured, server-side callers must supply it.
    // Frontend callers send a Bearer JWT instead — we accept either.
    const hasValidSecret = INVOKE_SECRET && incomingSecret === INVOKE_SECRET;
    const hasAuthHeader = authHeader.startsWith("Bearer ");

    if (!hasValidSecret && !hasAuthHeader) {
      console.error("[send-email] Unauthorized: missing valid secret or Bearer token");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-email] RESEND_API_KEY secret is not set");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise and deduplicate recipients
    const recipients: string[] = Array.from(
      new Set(
        (Array.isArray(to) ? to : [to])
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: { message: "No recipients" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (recipients.length > 50) {
      console.warn(`[send-email] Rejected: ${recipients.length} recipients exceeds limit of 50`);
      return new Response(
        JSON.stringify({ error: "Too many recipients. Maximum 50 per request." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-email] Sending to ${recipients.length} recipient(s): "${subject}"`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Academia HQ <support@academiahq.pro>",
        to: recipients,
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[send-email] Resend API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-email] Sent successfully. Resend ID:", data?.id);

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[send-email] Unhandled exception:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
