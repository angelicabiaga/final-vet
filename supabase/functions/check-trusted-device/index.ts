// Checks whether the caller's device is already trusted for a given
// PawCruz user, so the login flow (src/services/authService.js on web,
// src/api/authService.js on mobile) can skip OTP for it. A device only
// ever gets here if the user opted in via the "Trust this device for 30
// days" checkbox on a previous login OTP screen (see
// register-trusted-device) -- trust always has a fixed 30-day expiry,
// checked below.
//
// This runs with the Supabase service role key (via createClient below),
// which is the only way to read public.trusted_devices -- that table has
// RLS enabled with no anon/authenticated policies, on purpose (see
// supabase/TRUSTED_DEVICES.sql), so the browser's anon key can never read
// or forge a trusted-device row directly.
//
// One physical device holds exactly one stable device token (see
// register-trusted-device) -- what makes a device "trusted" is not that
// token by itself, but a public.trusted_devices row matching BOTH that
// token's hash AND this exact user_id. So the same device token is
// perfectly ordinary to see reused across many different accounts (each
// with their own row, their own expires_at, their own revoked_at); it
// only ever grants a skip-OTP result for the specific account(s) that
// have their own row for it, never for an account that hasn't trusted
// this device itself. Web sends the token via a single shared HttpOnly
// cookie (pawcruz_device_token, the browser attaches it automatically;
// JavaScript on the page never sees the raw value). Mobile has no cookie
// storage, so it sends the raw token (from its one stable Expo
// SecureStore entry) in the request body instead -- that's fine here
// because the request only ever travels over HTTPS straight to this
// function, and the token is never persisted anywhere in plaintext.
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

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_COOKIE_NAME = "pawcruz_device_token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    if (!userId) return json(req, { error: "userId is required." }, 400);
    if (!UUID_RE.test(userId)) return json(req, { error: "Invalid userId." }, 400);

    // The same device-token cookie is shared by every account on this
    // browser -- what scopes trust to the right account is the user_id
    // filter on the trusted_devices query below, not the cookie name.
    const rawToken = readCookie(req, DEVICE_COOKIE_NAME) || String(body?.deviceToken || "").trim();
    if (!rawToken) return json(req, { trusted: false });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "Server is not configured." }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const tokenHash = await sha256Hex(rawToken);

    const nowIso = new Date().toISOString();
    const { data: device, error } = await supabase
      .from("trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      // A row with no expires_at is never trusted (every row this system
      // writes now sets one -- see register-trusted-device) and .gt()
      // itself already excludes a null expires_at, this just makes that
      // "no expiry means not trusted" behavior explicit.
      .not("expires_at", "is", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (error) return json(req, { error: error.message }, 500);
    if (!device) return json(req, { trusted: false });

    await supabase.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", device.id);
    return json(req, { trusted: true });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unable to check device." }, 500);
  }
});
