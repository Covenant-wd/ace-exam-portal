const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[send-email] invoked");

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

    // FIX 3: Hard cap on recipients per call — prevents abuse of
    // this function as a spam relay. The frontend already batches
    // at 45; this enforces it server-side regardless of caller.
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
