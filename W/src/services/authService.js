import { supabase } from "../config/supabaseClient";

const SESSION_KEY = "pawcruz_session";

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function publicProfile(profile) {
  if (!profile) return null;
  const { password, ...safeProfile } = profile;
  return safeProfile;
}

export function getStoredSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(profile) {
  const session = {
    user: { id: profile.id, email: profile.email },
    profile: publicProfile(profile),
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("pawcruz-auth-change"));
  return session;
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

export async function registerPetOwner(values) {
  const fullName = String(values.fullName || "").trim();
  const username = normalizeIdentifier(values.username);
  const email = normalizeIdentifier(values.email);
  const password = String(values.password || "");

  if (fullName.length < 2) throw new Error("Please enter your complete name.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    throw new Error("Username must be 3–30 characters and may use letters, numbers, dots, dashes, or underscores.");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 6) throw new Error("Password must contain at least 6 characters.");

  const { data: existing, error: checkError } = await supabase
    .from("profiles")
    .select("id, username, email")
    .or(`username.eq.${username},email.eq.${email}`)
    .limit(1);

  if (checkError) throw new Error("Unable to check the account details. Apply custom_auth_patch.sql first.");
  if (existing?.length) throw new Error("That username or email is already registered.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      full_name: fullName,
      username,
      email,
      password,
      role: "pet_owner",
      account_status: "active"
    })
    .select("*")
    .single();

  if (error) {
    console.error("Registration error:", error);
    throw new Error("Registration failed. Check your Supabase SQL policies and required columns.");
  }

  await writeActivity(profile, "Account creation", `Pet-owner account created for ${username}.`);
  return publicProfile(profile);
}

export async function loginUser(identifier, password) {
  const normalized = normalizeIdentifier(identifier);
  const enteredPassword = String(password || "");

  if (!normalized || !enteredPassword) throw new Error("Enter your username/email and password.");

  const query = supabase
    .from("profiles")
    .select("*")
    .eq(normalized.includes("@") ? "email" : "username", normalized)
    .limit(1)
    .maybeSingle();

  const { data: profile, error } = await query;

  if (error) {
    console.error("Login lookup error:", error);
    throw new Error("Unable to validate your account. Apply custom_auth_patch.sql in Supabase.");
  }

  if (!profile || String(profile.password) !== enteredPassword) {
    await writeActivity(profile, "Failed login", `Failed login attempt for ${normalized}.`);
    throw new Error("Invalid username/email or password.");
  }

  if (profile.account_status !== "active") {
    throw new Error("Your account is inactive. Contact the administrator.");
  }

  const now = new Date().toISOString();
  await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
  const updatedProfile = { ...profile, last_login_at: now };
  await writeActivity(updatedProfile, "Login", `${profile.full_name} logged in.`);
  return saveSession(updatedProfile);
}

export async function logoutUser() {
  const session = getStoredSession();
  if (session?.profile) {
    await writeActivity(session.profile, "Logout", `${session.profile.full_name} logged out.`);
  }
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("pawcruz-auth-change"));
}

export async function getCurrentProfile(userId) {
  const session = getStoredSession();
  if (session?.profile?.id === userId) return session.profile;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, phone, address, role, avatar_url, account_status, last_login_at, created_at, updated_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(identifier) {
  const normalized = normalizeIdentifier(identifier);
  const field = normalized.includes("@") ? "email" : "username";
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq(field, normalized)
    .maybeSingle();
  if (error || !data) throw new Error("Account not found.");
  throw new Error("Custom password reset is not enabled yet. Ask an administrator to change the password.");
}

export async function updatePassword() {
  throw new Error("Use the Admin User Management module to change custom passwords.");
}
