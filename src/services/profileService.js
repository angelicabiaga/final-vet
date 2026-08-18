import { supabase } from "../config/supabaseClient";
import { createAndSendOtp, verifyProfileOtp } from "./authService";
import { validateImageFile, isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, validatePassword } from "../utils/validators";

const SESSION_KEY = "pawcruz_session";

function updateLocalProfile(updatedProfile) {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (stored?.profile?.id === updatedProfile.id) {
      const safe = { ...updatedProfile };
      delete safe.password;
      stored.profile = { ...stored.profile, ...safe };
      stored.user = { ...(stored.user || {}), id: safe.id, email: safe.email };
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      window.dispatchEvent(new Event("pawcruz-auth-change"));
    }
  } catch (error) {
    console.warn("Unable to refresh local profile session:", error);
  }
}

export async function getProfile(profileId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", profileId).single();
  if (error) throw new Error(`Unable to load profile: ${error.message}`);
  return data;
}

function normalizeProfile(values, role) {
  const payload = {
    full_name: String(values.full_name || "").trim(),
    username: String(values.username || "").trim().toLowerCase(),
    email: String(values.email || "").trim().toLowerCase(),
    phone: String(values.phone || "").trim() || null,
    address: String(values.address || "").trim() || null,
    avatar_url: values.avatar_url || null,
    updated_at: new Date().toISOString(),
  };
  if (payload.full_name.split(/\s+/).filter(Boolean).length < 2) throw new Error("First name and last name are both required.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(payload.username)) throw new Error("Username must contain 3–30 letters, numbers, dots, dashes, or underscores.");
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) throw new Error("Enter a valid email address.");
  if (role === "pet_owner") {
    if (!payload.phone) throw new Error("Contact number is required.");
    if (!isValidPhMobile(payload.phone)) throw new Error(INVALID_PH_MOBILE_MESSAGE);
  }
  return payload;
}

async function ensureNoDuplicate(profileId, payload) {
  const { data: duplicate, error: duplicateError } = await supabase.from("profiles").select("id").or(`username.eq.${payload.username},email.eq.${payload.email}`).neq("id", profileId).limit(1);
  if (duplicateError) throw new Error(`Unable to validate profile: ${duplicateError.message}`);
  if (duplicate?.length) throw new Error("The username or email is already used by another account.");
}

export async function updateProfile(profileId, values, role) {
  const payload = normalizeProfile(values, role);
  await ensureNoDuplicate(profileId, payload);
  const { data, error } = await supabase.from("profiles").update(payload).eq("id", profileId).select("*").single();
  if (error) throw new Error(`Unable to update profile: ${error.message}`);
  updateLocalProfile(data);
  return data;
}

export async function requestProfileUpdate(profileId, values, role) {
  const payload = normalizeProfile(values, role);
  await ensureNoDuplicate(profileId, payload);
  const { data: current, error } = await supabase.from("profiles").select("id,email").eq("id", profileId).single();
  if (error) throw new Error(`Unable to validate profile: ${error.message}`);
  if (String(current.email || "").toLowerCase() === payload.email) {
    const updated = await updateProfile(profileId, payload, role);
    return { requiresOtp: false, updated };
  }
  await createAndSendOtp(payload.email, "change_email", { profileId, role, values: payload });
  return { requiresOtp: true, email: payload.email, purpose: "change_email" };
}

export async function confirmProfileEmailChange(code) {
  const payload = verifyProfileOtp("change_email", code);
  return updateProfile(payload.profileId, payload.values || {}, payload.role);
}

export async function requestPasswordChange(profileId, currentPassword, newPassword) {
  validatePassword(String(newPassword || ""));
  const { data: current, error: loadError } = await supabase.from("profiles").select("id,email,password").eq("id", profileId).single();
  if (loadError) throw new Error(`Unable to validate password: ${loadError.message}`);
  if (String(current.password || "") !== String(currentPassword || "")) throw new Error("Current password is incorrect.");
  await createAndSendOtp(current.email, "change_password", { profileId, newPassword: String(newPassword) });
  return { requiresOtp: true, email: current.email, purpose: "change_password" };
}

export async function confirmPasswordChange(code) {
  const payload = verifyProfileOtp("change_password", code);
  const { error } = await supabase.from("profiles").update({ password: payload.newPassword, must_change_password: false, updated_at: new Date().toISOString() }).eq("id", payload.profileId);
  if (error) throw new Error(`Unable to update password: ${error.message}`);
  return true;
}

export async function changeOwnPassword(profileId, currentPassword, newPassword) {
  return requestPasswordChange(profileId, currentPassword, newPassword);
}

export async function uploadProfileAvatar(profileId, file) {
  if (!file) return null;
  validateImageFile(file);
  const extension = file.name.split(".").pop() || "jpg";
  const path = `${profileId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true });
  if (error) throw new Error(`Unable to upload profile image: ${error.message}`);
  return supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl;
}
