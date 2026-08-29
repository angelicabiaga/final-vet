// src/api/authService.js (Expo / React Native)

import * as SecureStore from "expo-secure-store";
import { supabase } from "../config/supabaseClient";
import { CONSENT_REQUIRED_ERROR, PRIVACY_NOTICE_VERSION } from "../constants/privacyNotice";
import { isValidPhMobile, INVALID_PH_MOBILE_MESSAGE } from "../utils/validators";
import { getQueue } from "./queueService";
import { getVeterinarianAppointments, todayLocal } from "./mobileAppointmentService";

const SESSION_KEY = "pawcruz_session";
const OTP_KEY = "pawcruz_pending_otp";
const DEVICE_TOKEN_KEY = "pawcruz_device_token";
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

export async function getStoredSession() {
  try {
    const stored = await SecureStore.getItemAsync(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    return null;
  }
}

async function saveSession(profile) {
  const session = {
    user: {
      id: profile.id,
      email: profile.email,
    },
    profile: publicProfile(profile),
    createdAt: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify(session)
  );

  return session;
}

export async function logoutUser() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// OTP (login) -- mirrors the web app's client-side OTP model in
// src/services/authService.js: the code and its expiry are generated here
// and only emailed via the send-otp-email Edge Function, which never
// stores or verifies it itself. Kept in Expo SecureStore instead of
// AsyncStorage since it's short-lived credential-adjacent data.
// ---------------------------------------------------------------------------

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function readPendingOtp() {
  try {
    const stored = await SecureStore.getItemAsync(OTP_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    await SecureStore.deleteItemAsync(OTP_KEY).catch(() => {});
    return null;
  }
}

async function writePendingOtp(record) {
  await SecureStore.setItemAsync(OTP_KEY, JSON.stringify(record));
}

async function clearPendingOtp() {
  await SecureStore.deleteItemAsync(OTP_KEY);
}

async function sendOtpEmail(email, code, purpose) {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-otp-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, code, purpose, expiresMinutes: OTP_EXPIRY_MINUTES }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || "Unable to send OTP email.");
  return data;
}

async function createAndSendLoginOtp(email, profileId) {
  const cleanEmail = normalizeIdentifier(email);
  const code = generateOtp();
  const record = {
    email: cleanEmail,
    purpose: "login",
    code,
    payload: { profileId },
    createdAt: Date.now(),
    expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  };
  await sendOtpEmail(cleanEmail, code, "login");
  await writePendingOtp(record);
}

export async function resendLoginOtp() {
  const pending = await readPendingOtp();
  if (!pending || pending.purpose !== "login") {
    throw new Error("No OTP request is available to resend.");
  }
  await createAndSendLoginOtp(pending.email, pending.payload?.profileId);
  return { success: true };
}

async function verifyPendingLoginOtp(code) {
  const pending = await readPendingOtp();
  if (!pending || pending.purpose !== "login") {
    throw new Error("No active OTP request was found. Please request a new code.");
  }
  if (Date.now() > Number(pending.expiresAt || 0)) {
    await clearPendingOtp();
    throw new Error("This OTP has expired. Please resend a new code.");
  }
  if (String(code || "").trim() !== String(pending.code || "")) {
    throw new Error("Invalid OTP code.");
  }
  return pending;
}

// ---------------------------------------------------------------------------
// Per-device login trust -- opt-in via a "Trust this device for 30 days"
// toggle on the login OTP screen, mirrors src/services/authService.js on
// web, backed by the same trusted_devices table (see
// supabase/TRUSTED_DEVICES.sql) via the same check-trusted-device /
// register-trusted-device Edge Functions. Mobile has no HttpOnly cookie
// jar, so the raw device token is stored directly in Expo SecureStore
// (never AsyncStorage) and sent to the Edge Functions over HTTPS instead
// of riding in a cookie the way it does on web. Trust expires exactly
// TRUSTED_DEVICE_DAYS after it was granted (fixed server-side by
// register-trusted-device); leaving the toggle off means this is never
// called, so the next login always requires OTP again.
// ---------------------------------------------------------------------------

async function callDeviceTrustFunction(name, payload) {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
    method: "POST",
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

// Fails closed: if the check can't be completed, the device is treated as
// untrusted so login falls back to OTP instead of silently skipping it.
async function checkTrustedDevice(profileId) {
  if (!profileId) return false;
  try {
    const deviceToken = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
    if (!deviceToken) return false;
    const data = await callDeviceTrustFunction("check-trusted-device", { userId: profileId, deviceToken });
    return Boolean(data?.trusted);
  } catch (error) {
    console.warn("Unable to check trusted device, requiring OTP:", error.message);
    return false;
  }
}

// Best-effort and never throws: a failed device registration must not
// block a login that has already succeeded.
async function registerTrustedDevice(profileId) {
  if (!profileId) return;
  try {
    const data = await callDeviceTrustFunction("register-trusted-device", { userId: profileId, platform: "mobile" });
    if (data?.deviceToken) {
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, data.deviceToken);
    }
  } catch (error) {
    console.warn("Unable to register this device as trusted:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Login -- OTP required only for a device not already trusted for this
// account (see checkTrustedDevice/registerTrustedDevice above).
// ---------------------------------------------------------------------------

export async function attemptLogin({ username, password }) {
  const normalized = normalizeIdentifier(username);
  const enteredPassword = String(password || "");

  if (!normalized || !enteredPassword) {
    throw new Error(
      "Enter your username/email and password."
    );
  }

  const loginColumn = normalized.includes("@")
    ? "email"
    : "username";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq(loginColumn, normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("Login lookup error:", error);

    throw new Error(
      "Unable to validate your account."
    );
  }

  if (
    !profile ||
    String(profile.password) !== enteredPassword
  ) {
    throw new Error(
      "Invalid username/email or password."
    );
  }

  if (profile.account_status !== "active") {
    throw new Error(
      "Your account is inactive. Contact the administrator."
    );
  }

  if (await checkTrustedDevice(profile.id)) {
    const session = await saveSession(profile);

    await supabase
      .from("activity_logs")
      .insert({
        user_id: profile.id,
        role: profile.role,
        action: "User login",
        module: "Authentication",
        description: `${profile.username || profile.email} logged in (trusted device, OTP skipped).`,
      });

    return {
      requiresOtp: false,
      email: profile.email,
      user: session.profile,
      profile: session.profile,
      session,
    };
  }

  await createAndSendLoginOtp(profile.email, profile.id);

  return {
    requiresOtp: true,
    email: profile.email,
    user: publicProfile(profile),
  };
}

// A logged-in Veterinarian's default landing spot on mobile: whichever of
// their own active work needs attention first, never another
// veterinarian's patients. Mirrors resolveLoginDestination on the web app.
//   1. An assigned queue entry that's actually active (Waiting/Serving --
//      this app has no separate "Ready" status) -- go straight to Live
//      Queue (My Queue), where the current/next patient already sorts to
//      the top.
//   2. No active queue, but a Confirmed consultation later today -- go to
//      My Appointments with focusToday so today's consultations sort
//      first instead of the default recency order.
//   3. Neither -- fall through to the Dashboard.
// Never throws: a failed lookup falls back to the Dashboard rather than
// blocking login on this convenience redirect.
export async function resolveVeterinarianLandingRoute(veterinarianId) {
  if (!veterinarianId) return { route: "vet-screen" };

  try {
    const [queueEntries, appointments] = await Promise.all([
      getQueue({ veterinarianId }),
      getVeterinarianAppointments(veterinarianId),
    ]);

    const hasActiveQueue = queueEntries.some((entry) => ["Waiting", "Serving"].includes(entry.status));
    if (hasActiveQueue) return { route: "VetLiveQueue" };

    const today = todayLocal();
    const hasTodaysAppointment = appointments.some(
      (item) => item.status === "Confirmed" && item.appointment_date === today
    );
    if (hasTodaysAppointment) return { route: "VetAppointment", params: { focusToday: true } };
  } catch (error) {
    console.warn("Unable to resolve the veterinarian landing route, defaulting to Dashboard:", error);
  }

  return { route: "vet-screen" };
}

export async function verifyLoginOtp(email, otp, trustDevice = false) {
  // Does not clear the pending OTP until the session below is established,
  // so a failure before that point leaves the OTP intact for a retry
  // instead of surfacing "No active verification request was found" for
  // an OTP that was already wiped out from under the user.
  const pending = await verifyPendingLoginOtp(otp);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", pending.payload?.profileId)
    .single();

  if (error || !profile) {
    throw new Error("Unable to complete login.");
  }

  // Session first -- this is what makes the login "succeed". Device
  // registration only happens if the user opted in (off is the default,
  // and means OTP is required again next time); it's also best-effort
  // (never throws, see above) and always runs before the OTP is cleared,
  // but a failure there must not undo or block the login that has
  // already happened.
  const session = await saveSession(profile);
  if (trustDevice) await registerTrustedDevice(profile.id);
  await clearPendingOtp();

  await supabase
    .from("activity_logs")
    .insert({
      user_id: profile.id,
      role: profile.role,
      action: "User login",
      module: "Authentication",
      description: `${profile.username || profile.email} logged in.`,
    });

  return {
    user: session.profile,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerUser({
  username,
  email,
  password,
  role,
  address,
  phone,
  serviceConsent,
  marketingConsent,
}) {
  const originalUsername = String(username || "").trim();
  const normalizedUsername =
    normalizeIdentifier(originalUsername);
  const normalizedEmail = normalizeIdentifier(email);
  const enteredPassword = String(password || "");
  const trimmedAddress = String(address || "").trim();
  const trimmedPhone = String(phone || "").trim();
  const resolvedRole = role || "pet_owner";

  if (!originalUsername) {
    throw new Error("Username is required.");
  }

  if (!/^[a-zA-Z0-9]+$/.test(originalUsername)) {
    throw new Error(
      "Username must contain letters and numbers only."
    );
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error("Invalid email format.");
  }

  if (!enteredPassword) {
    throw new Error("Password is required.");
  }

  // Data Privacy Consent is only required when self-registering a new
  // Pet Owner account -- Veterinarian/Staff accounts created from this
  // same screen are unaffected.
  if (resolvedRole === "pet_owner" && serviceConsent !== true) {
    throw new Error(CONSENT_REQUIRED_ERROR);
  }

  // The profiles table requires every pet_owner account to have an
  // address and a correctly-formatted phone number on file (see
  // supabase/pet_owner_address_constraint.sql and the
  // pet_owner_phone_format check constraint).
  if (resolvedRole === "pet_owner" && !trimmedAddress) {
    throw new Error("Address is required.");
  }

  if (resolvedRole === "pet_owner" && !isValidPhMobile(trimmedPhone)) {
    throw new Error(INVALID_PH_MOBILE_MESSAGE);
  }

  const { data: existing, error: checkError } =
    await supabase
      .from("profiles")
      .select("id")
      .or(
        `username.eq.${normalizedUsername},email.eq.${normalizedEmail}`
      )
      .limit(1);

  if (checkError) {
    console.log("Account checking error:", checkError);

    throw new Error(
      "Unable to check the account details."
    );
  }

  if (existing?.length) {
    throw new Error(
      "That username or email is already registered."
    );
  }

  let profile;

  if (resolvedRole === "pet_owner") {
    // pawcruz_create_pet_owner_with_consent inserts the profile and its
    // required consent record in one transaction (see
    // supabase/DATA_PRIVACY_CONSENT.sql), so a completed registration can
    // never end up without its required consent record, and no consent
    // row is ever created against a temporary/fake id.
    const { data, error } = await supabase.rpc("pawcruz_create_pet_owner_with_consent", {
      p_full_name: originalUsername,
      p_username: normalizedUsername,
      p_email: normalizedEmail,
      p_password: enteredPassword,
      p_marketing_consent: Boolean(marketingConsent),
      p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      p_source_context: "Mobile Account Registration",
      p_method: "Mobile App Form",
      p_address: trimmedAddress,
      p_phone: trimmedPhone,
    });

    if (error) {
      console.log("Registration error:", error);

      throw new Error(
        error.message ||
          "Registration failed. Check your Supabase policies and required columns."
      );
    }

    profile = data;
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        full_name: originalUsername,
        username: normalizedUsername,
        email: normalizedEmail,
        password: enteredPassword,
        role: resolvedRole,
        account_status: "active",
      })
      .select("*")
      .single();

    if (error) {
      console.log("Registration error:", error);

      throw new Error(
        error.message ||
          "Registration failed. Check your Supabase policies and required columns."
      );
    }

    profile = data;
  }

  await supabase
    .from("activity_logs")
    .insert({
      user_id: profile.id,
      role: profile.role,
      action: "Account creation",
      module: "Authentication",
      description: `${profile.role} account created for ${normalizedUsername}.`,
    });

  return {
    success: true,
    message:
      "Registration successful! You can now log in.",
    user: publicProfile(profile),
  };
}

// ---------------------------------------------------------------------------
// Forgot password without OTP
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email) {
  const normalized = normalizeIdentifier(email);

  if (!normalized) {
    throw new Error("Enter your email address.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    console.log("Password reset lookup error:", error);

    throw new Error(
      "Unable to look up that account."
    );
  }

  /*
  if (data) {
    await callOtpFunction("send-otp", {
      email: normalized,
      purpose: "password_reset",
    });
  }
  */

  if (!data) {
    return {
      success: false,
      message:
        "No account was found using that email address.",
    };
  }

  return {
    success: false,
    message:
      "Password reset is temporarily unavailable because OTP is disabled.",
  };
}

/*
export async function confirmPasswordReset(
  email,
  code,
  newPassword
) {
  await callOtpFunction("verify-otp", {
    email: normalizeIdentifier(email),
    purpose: "password_reset",
    code: String(code || "").trim(),
    payload: {
      newPassword: String(newPassword || ""),
    },
  });

  return {
    success: true,
  };
}
*/

export async function confirmPasswordReset() {
  throw new Error(
    "Password reset verification is temporarily disabled."
  );
}

// ---------------------------------------------------------------------------
// Account unlock
// ---------------------------------------------------------------------------

export async function unlockAccount() {
  throw new Error(
    "Account unlock isn't set up yet on the Supabase backend."
  );
}

export async function sendUnlockEmail() {
  throw new Error(
    "Account unlock isn't set up yet on the Supabase backend."
  );
}