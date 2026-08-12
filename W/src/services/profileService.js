import { supabase } from "../config/supabaseClient";

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
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (error) throw new Error(`Unable to load profile: ${error.message}`);
  return data;
}

export async function updateProfile(profileId, values) {
  const payload = {
    full_name: String(values.full_name || "").trim(),
    username: String(values.username || "").trim().toLowerCase(),
    email: String(values.email || "").trim().toLowerCase(),
    phone: String(values.phone || "").trim() || null,
    address: String(values.address || "").trim() || null,
    avatar_url: values.avatar_url || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.full_name.length < 2) throw new Error("Enter your complete name.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(payload.username)) {
    throw new Error("Username must contain 3–30 letters, numbers, dots, dashes, or underscores.");
  }
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) throw new Error("Enter a valid email address.");

  const { data: duplicate, error: duplicateError } = await supabase
    .from("profiles")
    .select("id")
    .or(`username.eq.${payload.username},email.eq.${payload.email}`)
    .neq("id", profileId)
    .limit(1);
  if (duplicateError) throw new Error(`Unable to validate profile: ${duplicateError.message}`);
  if (duplicate?.length) throw new Error("The username or email is already used by another account.");

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) throw new Error(`Unable to update profile: ${error.message}`);
  updateLocalProfile(data);
  return data;
}

export async function changeOwnPassword(profileId, currentPassword, newPassword) {
  if (String(newPassword || "").length < 6) throw new Error("New password must contain at least 6 characters.");

  const { data: current, error: loadError } = await supabase
    .from("profiles")
    .select("id, password")
    .eq("id", profileId)
    .single();
  if (loadError) throw new Error(`Unable to validate password: ${loadError.message}`);
  if (String(current.password || "") !== String(currentPassword || "")) {
    throw new Error("Current password is incorrect.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ password: newPassword, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(`Unable to update password: ${error.message}`);
}

export async function uploadProfileAvatar(profileId, file) {
  if (!file) return null;
  if (!file.type?.startsWith("image/")) throw new Error("Select an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile image must be 5 MB or smaller.");

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${profileId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true });
  if (error) throw new Error(`Unable to upload profile image: ${error.message}`);

  return supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl;
}


export function subscribeProfile(profileId, callback) {
  if (!profileId || typeof callback !== "function") return () => {};
  const channel = supabase
    .channel(`profile-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profileId}` }, (payload) => {
      updateLocalProfile(payload.new);
      callback(payload.new);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
