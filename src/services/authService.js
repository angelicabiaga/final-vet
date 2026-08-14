import { supabase } from "../config/supabaseClient";

const SESSION_KEY = "pawcruz_session";
const OTP_KEY = "pawcruz_pending_otp";
const RESET_KEY = "pawcruz_password_reset";
const TRUSTED_DEVICE_KEY = "pawcruz_trusted_devices";
export const OTP_EXPIRY_MINUTES = 10;
export const TRUSTED_DEVICE_DAYS = 30;

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

// "Don't ask again on this device for 30 days" -- purely client-side, keyed
// by profile id so multiple accounts on the same browser are tracked
// separately. There is no server-side device record; trust lives only in
// this browser's localStorage, same as the rest of this custom auth system.
function readTrustedDevices() {
  return readJson(TRUSTED_DEVICE_KEY) || {};
}

function isDeviceTrusted(profileId) {
  if (!profileId) return false;
  const trusted = readTrustedDevices();
  const expiresAt = Number(trusted[profileId] || 0);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    delete trusted[profileId];
    writeJson(TRUSTED_DEVICE_KEY, trusted);
    return false;
  }
  return true;
}

function trustThisDevice(profileId) {
  if (!profileId) return;
  const trusted = readTrustedDevices();
  trusted[profileId] = Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;
  writeJson(TRUSTED_DEVICE_KEY, trusted);
}

export function forgetTrustedDevice(profileId) {
  if (!profileId) return;
  const trusted = readTrustedDevices();
  delete trusted[profileId];
  writeJson(TRUSTED_DEVICE_KEY, trusted);
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
  const password = String(values.password || "");
  if (fullName.length < 2) throw new Error("Please enter your complete name.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("Username must be 3–30 characters and may use letters, numbers, dots, dashes, or underscores.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 6) throw new Error("Password must contain at least 6 characters.");
  return { fullName, username, email, password };
}

export async function registerPetOwner(values) {
  const clean = validateRegistration(values);
  const { data: existing, error: checkError } = await supabase.from("profiles").select("id, username, email").or(`username.eq.${clean.username},email.eq.${clean.email}`).limit(1);
  if (checkError) throw new Error("Unable to check the account details. Apply custom_auth_patch.sql first.");
  if (existing?.length) throw new Error("That username or email is already registered.");
  await createAndSendOtp(clean.email, "register", clean);
  return { requiresOtp: true, email: clean.email, purpose: "register" };
}

export async function completeRegistrationOtp(code) {
  const pending = verifyOtpCode("register", code);
  const values = pending.payload || {};
  const { data: profile, error } = await supabase.from("profiles").insert({
    full_name: values.fullName,
    username: values.username,
    email: values.email,
    password: values.password,
    role: "pet_owner",
    account_status: "active"
  }).select("*").single();
  if (error) throw new Error("Registration failed. Check your Supabase SQL policies and required columns.");
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

  if (isDeviceTrusted(profile.id)) {
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
  const pending = verifyOtpCode("login", code);
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", pending.payload?.profileId).single();
  if (error || !profile) throw new Error("Unable to complete login.");
  const now = new Date().toISOString();
  await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
  const updatedProfile = { ...profile, last_login_at: now };
  localStorage.removeItem(OTP_KEY);
  await writeActivity(updatedProfile, "Login", `${profile.full_name} logged in.`);
  if (trustDevice) trustThisDevice(profile.id);
  return saveSession(updatedProfile);
}

export async function logoutUser() {
  const session = getStoredSession();
  if (session?.profile) await writeActivity(session.profile, "Logout", `${session.profile.full_name} logged out.`);
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("pawcruz-auth-change"));
}

// Shared by the OTP screen and the trusted-device fast path in Login.jsx so
// both send a freshly logged-in user to the same place.
export function resolveLoginDestination(profile, fallback) {
  const role = profile?.role;
  const rolePath = role === "pet_owner" ? "pet-owner" : role;
  if (profile?.must_change_password) return `/${rolePath}/profile?forcePasswordChange=1`;
  return fallback || `/${rolePath}/dashboard`;
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
  if (password.length < 6) throw new Error("Password must contain at least 6 characters.");
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
