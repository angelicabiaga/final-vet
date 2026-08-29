import { supabase } from "../config/supabaseClient";
import { validatePassword, isValidPhMobile, INVALID_PH_MOBILE_MESSAGE } from "../utils/validators";
import { clearWelcomed } from "../utils/notificationSound";
import { CONSENT_REQUIRED_ERROR, PRIVACY_NOTICE_VERSION } from "../constants/privacyNotice";
import { getQueue } from "./queueService";
import { getAppointments, todayLocal } from "./appointmentService";

const SESSION_KEY = "pawcruz_session";
const OTP_KEY = "pawcruz_pending_otp";
const RESET_KEY = "pawcruz_password_reset";
export const OTP_EXPIRY_MINUTES = 10;
export const TRUSTED_DEVICE_DAYS = 30;

const SUPABASE_FUNCTIONS_URL = `${process.env.REACT_APP_SUPABASE_URL || ""}/functions/v1`;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function publicProfile(profile) {
  if (!profile) return null;
  const { password, ...safeProfile } = profile;
  return safeProfile;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { localStorage.removeItem(key); return null; }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredSession() {
  return readJson(SESSION_KEY);
}

function saveSession(profile) {
  const session = {
    user: { id: profile.id, email: profile.email },
    profile: publicProfile(profile),
    createdAt: new Date().toISOString()
  };
  writeJson(SESSION_KEY, session);
  window.dispatchEvent(new Event("pawcruz-auth-change"));
  return session;
}

// Per-device login trust, opt-in via the "Trust this device for 30 days"
// checkbox on the login OTP screen, backed by the trusted_devices table
// (see supabase/TRUSTED_DEVICES.sql) instead of a client-side timer. The
// browser never handles the raw device token directly: it lives only in
// an HttpOnly/Secure/SameSite=None cookie that register-trusted-device
// sets and check-trusted-device reads, so page JavaScript (and therefore
// this file) never sees its value. `credentials: "include"` is required
// on both calls so the browser attaches/accepts that cookie even though
// the Edge Function lives on a different origin than this app.
//
// Trust expires exactly TRUSTED_DEVICE_DAYS after it was granted (fixed
// server-side by register-trusted-device -- this file never computes or
// sends an expiry itself), or ends earlier if the cookie is cleared (new
// browser/profile, cleared site data, reinstalled app) or the account's
// password changes, which revokes every trusted device for that user
// server-side (see the trigger in supabase/TRUSTED_DEVICES.sql). Leaving
// the checkbox unchecked means registerTrustedDevice is never called at
// all, so the next login always requires OTP again.
async function callDeviceTrustFunction(name, payload) {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || "Device trust request failed.");
  return data;
}

// Fails closed: if the check can't be completed (network error, function
// down), the device is treated as untrusted so login falls back to OTP
// instead of silently skipping it.
async function checkTrustedDevice(profileId) {
  if (!profileId) return false;
  try {
    const data = await callDeviceTrustFunction("check-trusted-device", { userId: profileId });
    return Boolean(data?.trusted);
  } catch (error) {
    console.warn("Unable to check trusted device, requiring OTP:", error.message);
    return false;
  }
}

// Best-effort and never throws: a failed device registration must not
// block a login that has already succeeded, and must not leave the OTP
// screen showing "No active verification request was found" (see
// completeLoginOtp below, which clears the OTP only after this settles).
async function registerTrustedDevice(profileId) {
  if (!profileId) return;
  try {
    await callDeviceTrustFunction("register-trusted-device", { userId: profileId, platform: "web" });
  } catch (error) {
    console.warn("Unable to register this device as trusted:", error.message);
  }
}

async function writeActivity(profile, action, description) {
  try {
    await supabase.from("activity_logs").insert({
      user_id: profile?.id || null,
      role: profile?.role || null,
      action,
      module: "Authentication",
      description,
      device_browser: navigator.userAgent
    });
  } catch (error) {
    console.warn("Activity log was not saved:", error.message);
  }
}

async function sendOtpEmail(email, code, purpose) {
  const { data, error } = await supabase.functions.invoke("send-otp-email", {
    body: { email, code, purpose, expiresMinutes: OTP_EXPIRY_MINUTES }
  });
  if (error) {
    let message = error.message || "Unable to send OTP email.";
    try {
      const body = await error.context?.json();
      message = body?.error || body?.message || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createAndSendOtp(email, purpose, payload = {}) {
  const cleanEmail = normalizeIdentifier(email);
  const code = generateOtp();
  const record = {
    email: cleanEmail,
    purpose,
    code,
    payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  };
  await sendOtpEmail(cleanEmail, code, purpose);
  writeJson(OTP_KEY, record);
  return { email: cleanEmail, purpose, expiresMinutes: OTP_EXPIRY_MINUTES };
}

export function getPendingOtp() {
  const pending = readJson(OTP_KEY);
  if (!pending) return null;
  if (Date.now() > Number(pending.expiresAt || 0)) {
    localStorage.removeItem(OTP_KEY);
    return null;
  }
  return { ...pending, code: undefined };
}

function verifyOtpCode(purpose, code) {
  const pending = readJson(OTP_KEY);
  if (!pending || pending.purpose !== purpose) throw new Error("No active OTP request was found. Please request a new code.");
  if (Date.now() > Number(pending.expiresAt || 0)) {
    localStorage.removeItem(OTP_KEY);
    throw new Error("This OTP has expired. Please resend a new code.");
  }
  if (String(code || "").trim() !== String(pending.code || "")) throw new Error("Invalid OTP code.");
  return pending;
}

export async function resendAuthOtp(purpose) {
  const pending = readJson(OTP_KEY);
  if (!pending || pending.purpose !== purpose) throw new Error("No OTP request is available to resend.");
  return createAndSendOtp(pending.email, pending.purpose, pending.payload || {});
}

function validateRegistration(values) {
  const fullName = String(values.fullName || "").trim();
  const username = normalizeIdentifier(values.username);
  const email = normalizeIdentifier(values.email);
  const address = String(values.address || "").trim();
  const phone = String(values.phone || "").trim();
  const password = String(values.password || "");
  if (fullName.split(/\s+/).filter(Boolean).length < 2) throw new Error("First name and last name are both required.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("Username must be 3–30 characters and may use letters, numbers, dots, dashes, or underscores.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  // The profiles table requires every pet_owner account to have an
  // address and a correctly-formatted phone number on file (see
  // supabase/pet_owner_address_constraint.sql and the
  // pet_owner_phone_format check constraint) -- checked here so a
  // missing/invalid value surfaces as a clear message instead of a raw
  // database constraint error.
  if (!address) throw new Error("Address is required.");
  if (!isValidPhMobile(phone)) throw new Error(INVALID_PH_MOBILE_MESSAGE);
  validatePassword(password);
  // Checked separately from the field/password validation above -- the
  // caller (Register.jsx) already blocks submission on this in the UI;
  // this is the service-layer backstop so no caller can skip it.
  if (values.serviceConsent !== true) throw new Error(CONSENT_REQUIRED_ERROR);
  return { fullName, username, email, address, phone, password, marketingConsent: Boolean(values.marketingConsent) };
}

export async function registerPetOwner(values) {
  const clean = validateRegistration(values);
  const { data: existing, error: checkError } = await supabase.from("profiles").select("id, username, email").or(`username.eq.${clean.username},email.eq.${clean.email}`).limit(1);
  if (checkError) throw new Error("Unable to check the account details. Apply custom_auth_patch.sql first.");
  if (existing?.length) throw new Error("That username or email is already registered.");
  await createAndSendOtp(clean.email, "register", clean);
  return { requiresOtp: true, email: clean.email, purpose: "register" };
}

/**
 * pawcruz_create_pet_owner_with_consent inserts the profile and the
 * consent_records row(s) in one transaction (see
 * supabase/DATA_PRIVACY_CONSENT.sql) -- there is no separate consent
 * insert here, so a completed registration can never end up without its
 * required consent record. The consent choice is made on the
 * registration form itself (Register.jsx), not on this OTP screen -- it
 * travels here inside the OTP's stored payload (set by
 * registerPetOwner/validateRegistration above) exactly the same way
 * fullName/username/email/password already do, and is only actually
 * recorded once the OTP is verified and the account is truly created.
 */
export async function completeRegistrationOtp(code) {
  const pending = verifyOtpCode("register", code);
  const values = pending.payload || {};
  const { data: profile, error } = await supabase.rpc("pawcruz_create_pet_owner_with_consent", {
    p_full_name: values.fullName,
    p_username: values.username,
    p_email: values.email,
    p_password: values.password,
    p_marketing_consent: Boolean(values.marketingConsent),
    p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
    p_source_context: "Account Registration",
    p_method: "Web Form",
    p_address: values.address,
    p_phone: values.phone,
  });
  if (error) throw new Error(error.message || "Registration failed. Check your Supabase SQL policies and required columns.");
  localStorage.removeItem(OTP_KEY);
  await writeActivity(profile, "Account creation", `Pet-owner account created for ${values.username}.`);
  return publicProfile(profile);
}

export async function loginUser(identifier, password) {
  const normalized = normalizeIdentifier(identifier);
  const enteredPassword = String(password || "");
  if (!normalized || !enteredPassword) throw new Error("Enter your username/email and password.");

  const { data: profile, error } = await supabase.from("profiles").select("*").eq(normalized.includes("@") ? "email" : "username", normalized).limit(1).maybeSingle();
  if (error) throw new Error("Unable to validate your account. Apply custom_auth_patch.sql in Supabase.");
  if (!profile || String(profile.password) !== enteredPassword) {
    await writeActivity(profile, "Failed login", `Failed login attempt for ${normalized}.`);
    throw new Error("Invalid username/email or password.");
  }
  if (profile.account_status !== "active") throw new Error("Your account is inactive. Contact the administrator.");

  if (await checkTrustedDevice(profile.id)) {
    const now = new Date().toISOString();
    await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
    const updatedProfile = { ...profile, last_login_at: now };
    await writeActivity(updatedProfile, "Login", `${profile.full_name} logged in (trusted device, OTP skipped).`);
    return { requiresOtp: false, ...saveSession(updatedProfile) };
  }

  await createAndSendOtp(profile.email, "login", { profileId: profile.id });
  return { requiresOtp: true, email: profile.email, purpose: "login" };
}

export async function completeLoginOtp(code, trustDevice = false) {
  // Deliberately does not clear OTP_KEY until after the session below is
  // established: an interrupted verification (e.g. a thrown error before
  // this point) must leave the pending OTP intact so the user can retry,
  // rather than getting stuck on "No active verification request was
  // found" for an OTP that was already wiped out from under them.
  const pending = verifyOtpCode("login", code);
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", pending.payload?.profileId).single();
  if (error || !profile) throw new Error("Unable to complete login.");
  const now = new Date().toISOString();
  await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
  const updatedProfile = { ...profile, last_login_at: now };

  // Session first -- this is what makes the login "succeed". Device
  // registration only happens if the user opted in (unchecked is the
  // default, and means OTP is required again next time); it's also
  // best-effort (never throws, see above) and always runs before the OTP
  // is cleared, but a failure there must not undo or block the login that
  // has already happened.
  const session = saveSession(updatedProfile);
  if (trustDevice) await registerTrustedDevice(profile.id);
  localStorage.removeItem(OTP_KEY);
  await writeActivity(updatedProfile, "Login", `${profile.full_name} logged in.`);
  return session;
}

export async function logoutUser() {
  const session = getStoredSession();
  if (session?.profile) await writeActivity(session.profile, "Logout", `${session.profile.full_name} logged out.`);
  localStorage.removeItem(SESSION_KEY);
  clearWelcomed();
  window.dispatchEvent(new Event("pawcruz-auth-change"));
}

// A logged-in Veterinarian's default landing spot: whichever of their own
// active work needs attention first, never another veterinarian's patients.
//   1. An assigned queue entry that's actually active (Waiting/Serving --
//      this app has no separate "Ready" status) -- go straight to My Queue,
//      where the current/next patient already sorts to the top.
//   2. No active queue, but a Confirmed consultation later today -- go to
//      Today's Appointments, with focusToday so the table doesn't hide
//      today's (not-yet-checked-in) consultations the way it normally would.
//   3. Neither -- fall through to the Dashboard.
// Never throws: if the lookup itself fails, the caller falls back to the
// Dashboard rather than blocking login on this convenience redirect.
async function resolveVeterinarianLandingRoute(veterinarianId) {
  const queueRows = await getQueue({ veterinarianId });
  const hasActiveQueue = queueRows.some((entry) => ["Waiting", "Serving"].includes(entry.status));
  if (hasActiveQueue) return { pathname: "/veterinarian/queue" };

  const todaysAppointments = await getAppointments({
    veterinarianId,
    status: "Confirmed",
    date: todayLocal(),
  });
  if (todaysAppointments.length > 0) {
    return { pathname: "/veterinarian/appointments", state: { focusToday: true } };
  }

  return null;
}

// Shared by the OTP screen and the trusted-device fast path in Login.jsx so
// both send a freshly logged-in user to the same place. Returns
// { pathname, state? } -- callers spread state into their navigate() call.
export async function resolveLoginDestination(profile, fallback) {
  const role = profile?.role;
  const rolePath = role === "pet_owner" ? "pet-owner" : role;
  if (profile?.must_change_password) return { pathname: `/${rolePath}/profile?forcePasswordChange=1` };
  if (fallback) return { pathname: fallback };

  if (role === "veterinarian" && profile?.id) {
    try {
      const destination = await resolveVeterinarianLandingRoute(profile.id);
      if (destination) return destination;
    } catch (error) {
      console.warn("Unable to resolve the veterinarian landing route, defaulting to Dashboard:", error);
    }
  }

  return { pathname: `/${rolePath}/dashboard` };
}

export async function getCurrentProfile(userId) {
  const session = getStoredSession();
  if (session?.profile?.id === userId) return session.profile;
  const { data, error } = await supabase.from("profiles").select("id, full_name, username, email, phone, address, role, avatar_url, account_status, must_change_password, last_login_at, created_at, updated_at").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(identifier) {
  const normalized = normalizeIdentifier(identifier);
  const field = normalized.includes("@") ? "email" : "username";
  const { data: profile, error } = await supabase.from("profiles").select("id, email").eq(field, normalized).maybeSingle();
  if (error || !profile) throw new Error("Account not found.");
  await createAndSendOtp(profile.email, "forgot_password", { profileId: profile.id });
  return { requiresOtp: true, email: profile.email, purpose: "forgot_password" };
}

export function completePasswordResetOtp(code) {
  const pending = verifyOtpCode("forgot_password", code);
  writeJson(RESET_KEY, { profileId: pending.payload?.profileId, expiresAt: Date.now() + 15 * 60 * 1000 });
  localStorage.removeItem(OTP_KEY);
  return true;
}

export async function updatePassword(newPassword) {
  const password = String(newPassword || "");
  validatePassword(password);
  const reset = readJson(RESET_KEY);
  if (!reset?.profileId || Date.now() > Number(reset.expiresAt || 0)) {
    localStorage.removeItem(RESET_KEY);
    throw new Error("Password reset verification expired. Request a new OTP.");
  }
  const { error } = await supabase.from("profiles").update({ password, updated_at: new Date().toISOString() }).eq("id", reset.profileId);
  if (error) throw new Error(`Unable to update password: ${error.message}`);
  localStorage.removeItem(RESET_KEY);
  return true;
}

export function verifyProfileOtp(purpose, code) {
  const pending = verifyOtpCode(purpose, code);
  localStorage.removeItem(OTP_KEY);
  return pending.payload || {};
}
