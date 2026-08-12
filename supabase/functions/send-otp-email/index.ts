const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const PURPOSE_LABELS: Record<string, string> = {
  register: "Registration",
  login: "Login",
  forgot_password: "Password Reset",
  change_password: "Change Password",
  change_email: "Change Email",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { email, code, purpose, expiresMinutes = 10 } = await req.json();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();
    const cleanPurpose = String(purpose || "login").trim();

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return json({ error: "A valid email is required." }, 400);
    if (!/^\d{6}$/.test(cleanCode)) return json({ error: "A valid 6-digit OTP is required." }, 400);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "RESEND_API_KEY is not configured." }, 500);

    const from = Deno.env.get("RESEND_FROM_EMAIL") || "PawCruz <onboarding@resend.dev>";
    const label = PURPOSE_LABELS[cleanPurpose] || "Verification";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [cleanEmail],
        subject: `PawCruz ${label} OTP`,
        html: `
          <div style="font-family:Arial,sans-serif;background:#f4fbfe;padding:32px;color:#20313b">
            <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:30px;border:1px solid #dceff6">
              <h2 style="margin:0 0 8px;color:#318fbe">PawCruz ${label}</h2>
              <p style="margin:0 0 22px;color:#60717a">Use this verification code to continue:</p>
              <div style="font-size:36px;font-weight:800;letter-spacing:10px;text-align:center;padding:20px;background:#edf9fd;border-radius:14px;color:#20313b">${cleanCode}</div>
              <p style="margin:22px 0 0;color:#60717a">This code expires in ${Number(expiresMinutes) || 10} minutes.</p>
              <p style="margin:8px 0 0;color:#60717a">If you did not request this code, you can ignore this email.</p>
            </div>
          </div>`,
      }),
    });

    const data = await response.json();
    if (!response.ok) return json({ error: data?.message || data?.error || "Resend could not send the OTP email.", details: data }, response.status);

    return json({ success: true, id: data?.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to send OTP email." }, 500);
  }
});
