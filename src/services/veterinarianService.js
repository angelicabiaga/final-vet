import { supabase } from "../config/supabaseClient";
import { isValidPhMobile, INVALID_PH_MOBILE_MESSAGE } from "../utils/validators";

const SESSION_KEY = "pawcruz_session";

// Mirrors profileService's own local-session refresh, kept as a separate
// copy here so this file never has to import from (and therefore never
// risks changing behavior for) profileService's shared, multi-role code.
function syncLocalSession(updatedProfile) {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (stored?.profile?.id === updatedProfile.id) {
      const safe = { ...updatedProfile };
      delete safe.password;
      stored.profile = { ...stored.profile, ...safe };
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
      window.dispatchEvent(new Event("pawcruz-auth-change"));
    }
  } catch (error) {
    console.warn("Unable to refresh local profile session:", error);
  }
}

// Card-grid listing: every active veterinarian. Schedule/availability is
// intentionally not included here -- that stays exclusive to the existing
// Veterinarian Schedule Management module.
export async function getVeterinarianDirectory() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "veterinarian")
    .eq("account_status", "active")
    .order("full_name");
  if (error) throw new Error(`Unable to load veterinarians: ${error.message}`);
  return data || [];
}

// Never accepts license_number -- nobody types or edits it, ever. It is
// only ever written once, automatically, by
// veterinarianVerificationService.reviewVerification when an
// administrator approves an OCR-read PRC ID submission.
function normalizeVeterinarianProfile(values) {
  const payload = {
    full_name: String(values.full_name || "").trim(),
    username: String(values.username || "").trim().toLowerCase(),
    email: String(values.email || "").trim().toLowerCase(),
    phone: String(values.phone || "").trim(),
    address: String(values.address || "").trim(),
    specialization: String(values.specialization || "").trim(),
    education: String(values.education || "").trim() || null,
    years_experience:
      values.years_experience === "" || values.years_experience === null || values.years_experience === undefined
        ? null
        : Number(values.years_experience),
    certifications_training: String(values.certifications_training || "").trim() || null,
    previous_practice: String(values.previous_practice || "").trim() || null,
    professional_interests: String(values.professional_interests || "").trim() || null,
    biography: String(values.biography || "").trim() || null,
    avatar_url: values.avatar_url || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.full_name.split(/\s+/).filter(Boolean).length < 2) throw new Error("First name and last name are both required.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(payload.username)) throw new Error("Username must contain 3–30 letters, numbers, dots, dashes, or underscores.");
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) throw new Error("Enter a valid email address.");
  if (!payload.phone) throw new Error("Contact number is required.");
  if (!isValidPhMobile(payload.phone)) throw new Error(INVALID_PH_MOBILE_MESSAGE);
  if (!payload.address) throw new Error("Address is required.");
  if (!payload.specialization) throw new Error("Specialization is required.");
  if (payload.years_experience !== null && (!Number.isFinite(payload.years_experience) || payload.years_experience < 0)) {
    throw new Error("Years of experience must be a valid non-negative number.");
  }

  return payload;
}

async function ensureNoDuplicateVeterinarian(profileId, payload) {
  const { data: duplicate, error } = await supabase
    .from("profiles")
    .select("id")
    .or(`username.eq.${payload.username},email.eq.${payload.email}`)
    .neq("id", profileId)
    .limit(1);
  if (error) throw new Error(`Unable to validate profile: ${error.message}`);
  if (duplicate?.length) throw new Error("The username or email is already used by another account.");
}

// Self-service save for the veterinarian's own general profile fields
// (name, contact info, specialization, and Background in Veterinary
// Medicine details). License number is intentionally never part of this
// payload -- see normalizeVeterinarianProfile.
export async function updateVeterinarianProfile(profileId, values, actor) {
  const payload = normalizeVeterinarianProfile(values);
  await ensureNoDuplicateVeterinarian(profileId, payload);
  const { data, error } = await supabase.from("profiles").update(payload).eq("id", profileId).select("*").single();
  if (error) throw new Error(`Unable to update veterinarian profile: ${error.message}`);
  if (actor?.id === profileId) syncLocalSession(data);
  return data;
}
