const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { email, fullName, tempPassword } = await req.json();

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return json({ error: "A valid email is required." }, 400);
    const cleanPassword = String(tempPassword || "");
    if (!cleanPassword) return json({ error: "A temporary password is required." }, 400);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "RESEND_API_KEY is not configured." }, 500);
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "PawCruz <onboarding@resend.dev>";
    const websiteUrl = "https://www.pawcruz.business/";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [cleanEmail],
        subject: "Your PawCruz Account",
        html: `
          <div style="font-family:Arial,sans-serif;background:#f4fbfe;padding:32px;color:#20313b">
            <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:30px;border:1px solid #dceff6">
              <h2 style="margin:0 0 8px;color:#318fbe">Your PawCruz Account</h2>
              <p style="margin:0 0 14px;color:#60717a">Hi ${fullName || "there"}, a pet owner account was created for you at Cruz Veterinary Clinic.</p>
              <p style="margin:0 0 22px;color:#60717a">Your pet's records — visit history, appointments, and queue status — are already saved in this account. Log in anytime you want to check them.</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                <tr><td style="padding:8px 0;color:#60717a">Login Email</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#20313b">${cleanEmail}</td></tr>
                <tr><td style="padding:8px 0;color:#60717a;border-top:1px solid #edf3f6">Temporary Password</td><td style="padding:8px 0;text-align:right;font-weight:800;font-size:18px;letter-spacing:1px;color:#20313b;border-top:1px solid #edf3f6">${cleanPassword}</td></tr>
              </table>
              <p style="margin:0 0 22px;color:#60717a">For your security, you'll be asked to set a new password the first time you log in.</p>
              <div style="margin:0 0 22px;padding:16px 18px;background:#f2fafd;border-radius:12px;color:#60717a">
                <p style="margin:0 0 8px;color:#20313b;font-weight:700">Get Started</p>
                <p style="margin:0 0 6px">We encourage downloading the PawCruz app from the Google Play Store or Apple App Store — it's the easiest way to check your pet's records and appointments on the go.</p>
                <p style="margin:0">Or visit our website to create your account and sign in: <a href="${websiteUrl}" style="color:#318fbe;font-weight:700;text-decoration:none">${websiteUrl}</a></p>
              </div>
              <p style="margin:22px 0 0;color:#60717a">If you weren't expecting this, you can ignore this email.</p>
            </div>
          </div>`,
      }),
    });

    const data = await response.json();
    if (!response.ok) return json({ error: data?.message || data?.error || "Resend could not send the account email.", details: data }, response.status);

    return json({ success: true, id: data?.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to send the account email." }, 500);
  }
});
