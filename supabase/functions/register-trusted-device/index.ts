// Marks the caller's current device as trusted for a given PawCruz user.
// Only called when the user checked "Trust this device for 30 days" on
// the login OTP screen right after a successful verification (see
// completeLoginOtp in src/services/authService.js / verifyLoginOtp in
// src/api/authService.js) -- leaving it unchecked means this function is
// never called at all, so no row is written and the next login requires
// OTP again. From then on, check-trusted-device lets that same device
// skip OTP for exactly 30 days from this moment (expires_at is computed
// here, server-side, so a client can't request a longer window) -- until
// the token is cleared client-side, the 30 days pass, or the account's
// password changes (see the trigger in supabase/TRUSTED_DEVICES.sql).
//
// Only the SHA-256 hash of the device token is ever written to
// public.trusted_devices (via the service role key, since that table has
// no anon/authenticated RLS policies at all). The raw token itself:
//   - web: is sent back ONLY as an HttpOnly/Secure/SameSite=None cookie --
//     it never appears in the JSON response body, so page JavaScript can
//     never read or exfiltrate it, matching the same guarantee an
//     HttpOnly cookie always has.
//   - mobile: is returned in the JSON body once, since there is no cookie
//     jar on a native app -- the caller must immediately store it with
//     Expo SecureStore and never place it in AsyncStorage or plain state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...extraHeaders, "Content-Type": "application/json" },
  });
}

function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TRUSTED_DEVICE_DAYS = 30;
const DEVICE_COOKIE_MAX_AGE_SECONDS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60; // Cookie lifetime matches the server-side expires_at below -- even if a client ignored Max-Age and kept sending the cookie past 30 days, check-trusted-device would still reject it.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const platform = String(body?.platform || "web").trim();
    if (!userId) return json(req, { error: "userId is required." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Server is not configured." }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rawToken = generateRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("trusted_devices").insert({
      user_id: userId,
      token_hash: tokenHash,
      user_agent: req.headers.get("user-agent") || null,
      expires_at: expiresAt,
    });
    if (error) return json(req, { error: error.message }, 500);

    if (platform === "mobile") {
      return json(req, { success: true, deviceToken: rawToken });
    }

    const cookie = `pawcruz_device=${rawToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`;
    return json(req, { success: true }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unable to register device." }, 500);
  }
});
