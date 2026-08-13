const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(time: string): string {
  const [hour, minute] = String(time || "").slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hour)) return time;
  const date = new Date(2000, 0, 1, hour, minute || 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const {
      email, fullName, petNames, appointmentDate, startTime, endTime,
      veterinarianName, queueNumber,
    } = await req.json();

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return json({ error: "A valid email is required." }, 400);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "RESEND_API_KEY is not configured." }, 500);
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "PawCruz <onboarding@resend.dev>";

    const petLabel = Array.isArray(petNames) && petNames.length ? petNames.join(", ") : "your pet";
    const dateLabel = appointmentDate ? formatDate(appointmentDate) : "—";
    const timeLabel = startTime ? `${formatTime(startTime)}${endTime ? ` – ${formatTime(endTime)}` : ""}` : "—";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [cleanEmail],
        subject: "Your PawCruz booking is confirmed",
        html: `
          <div style="font-family:Arial,sans-serif;background:#f4fbfe;padding:32px;color:#20313b">
            <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:30px;border:1px solid #dceff6">
              <h2 style="margin:0 0 8px;color:#318fbe">Booking Confirmed</h2>
              <p style="margin:0 0 22px;color:#60717a">Hi ${fullName || "there"}, your booking with PawCruz has been confirmed.</p>
              <div style="text-align:center;padding:20px;background:#edf9fd;border-radius:14px;margin-bottom:20px">
                <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#318fbe;margin-bottom:6px">Queue Number</div>
                <div style="font-size:34px;font-weight:800;letter-spacing:2px;color:#20313b">${queueNumber || "—"}</div>
              </div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
                <tr><td style="padding:8px 0;color:#60717a">Pet</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#20313b">${petLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#60717a;border-top:1px solid #edf3f6">Date</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#20313b;border-top:1px solid #edf3f6">${dateLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#60717a;border-top:1px solid #edf3f6">Time</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#20313b;border-top:1px solid #edf3f6">${timeLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#60717a;border-top:1px solid #edf3f6">Veterinarian</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#20313b;border-top:1px solid #edf3f6">${veterinarianName || "—"}</td></tr>
              </table>
              <p style="margin:22px 0 0;color:#60717a">Please bring your queue number with you. If you need to make any changes, contact Cruz Veterinary Clinic directly.</p>
            </div>
          </div>`,
      }),
    });

    const data = await response.json();
    if (!response.ok) return json({ error: data?.message || data?.error || "Resend could not send the booking confirmation email.", details: data }, response.status);

    return json({ success: true, id: data?.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to send booking confirmation email." }, 500);
  }
});
