// Marks the caller's current device as trusted for a given PawCruz user.
// Only called when the user checked "Trust this device for 30 days" on
// the login OTP screen right after a successful verification (see
// completeLoginOtp in src/services/authService.js / verifyLoginOtp in
// src/api/authService.js) -- leaving it unchecked means this function is
// never called at all, so no row is written for that account and its
// next login requires OTP again. From then on, check-trusted-device lets
// that same device skip OTP for that account for exactly 30 days from
// this moment (expires_at is computed here, server-side, so a client
// can't request a longer window) -- until the device token is cleared
// client-side, the 30 days pass, or the account's password changes (see
// the trigger in supabase/TRUSTED_DEVICES.sql).
//
// One browser/app install has exactly ONE stable device token -- it is
// generated here only the first time this device ever trusts any
// account, and every later call (whether re-trusting that same account
// or trusting a completely different one on the same device) reuses that
// same token instead of minting a new one. That is what lets multiple
// accounts each independently trust one physical device: every account
// gets its own public.trusted_devices row (upserted below, keyed by
// (user_id, token_hash)), but all of those rows share the same
// token_hash, so trusting account B can never disturb account A's row or
// force A to be re-verified.
//
// Only the SHA-256 hash of the device token is ever written to
// public.trusted_devices (via the service role key, since that table has
// no anon/authenticated RLS policies at all). The raw token itself:
//   - web: lives ONLY in a single HttpOnly/Secure/SameSite=None cookie
//     named pawcruz_device_token -- the same cookie for every account on
//     this browser, reused (its value read back off the incoming
//     request) rather than replaced on every registration. It never
//     appears in the JSON response body, so page JavaScript can never
//     read or exfiltrate it, matching the same guarantee an HttpOnly
//     cookie always has.
//   - mobile: is returned in the JSON body, since there is no cookie jar
//     on a native app. The caller stores it under one stable Expo
//     SecureStore key (never AsyncStorage) and must send that same value
//     back as `existingDeviceToken` on every later registration call (for
//     any account) so this function reuses it instead of minting a new
//     one -- see checkTrustedDevice/registerTrustedDevice in
//     src/api/authService.js.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches exactly what generateRawToken produces (32 random bytes,
// base64url-encoded without padding) -- used to sanity-check a reused
// token (from a cookie we set ourselves, or a value the mobile client
// claims to already hold) before it's hashed and stored.
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const DEVICE_COOKIE_NAME = "pawcruz_device_token";

function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
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
    if (!UUID_RE.test(userId)) return json(req, { error: "Invalid userId." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Server is not configured." }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Reuse this device's existing stable token if it already has one --
    // web reads it back off its own cookie; mobile has no cookie jar, so
    // the client sends back whatever it already has in SecureStore. Only
    // mint a brand-new token the first time this device ever trusts any
    // account. Either way, a malformed/tampered candidate is discarded in
    // favor of minting a fresh one rather than trusted as-is.
    const candidateToken = platform === "mobile"
      ? String(body?.existingDeviceToken || "").trim()
      : (readCookie(req, DEVICE_COOKIE_NAME) || "").trim();
    const rawToken = TOKEN_RE.test(candidateToken) ? candidateToken : generateRawToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Upserted on (user_id, token_hash) -- see the unique index in
    // supabase/TRUSTED_DEVICES.sql -- so re-trusting the same device for
    // an account already extends/refreshes that one row instead of
    // erroring on a duplicate, while a different account sharing the same
    // token_hash gets its own separate row rather than colliding with it.
    const { error } = await supabase.from("trusted_devices").upsert({
      user_id: userId,
      token_hash: tokenHash,
      user_agent: req.headers.get("user-agent") || null,
      expires_at: expiresAt,
      revoked_at: null,
      last_used_at: null,
    }, { onConflict: "user_id,token_hash" });
    if (error) return json(req, { error: error.message }, 500);

    if (platform === "mobile") {
      return json(req, { success: true, deviceToken: rawToken });
    }

    // Always (re-)set the same cookie, refreshing its Max-Age -- reusing
    // an existing token here is a no-op write of the same value; minting
    // a new one persists it for the first time. Either way this is the
    // one shared cookie name for every account on this browser, never a
    // per-account name, so trusting a second account cannot orphan the
    // first account's cookie.
    const cookie = `${DEVICE_COOKIE_NAME}=${rawToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`;
    return json(req, { success: true }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unable to register device." }, 500);
  }
});
