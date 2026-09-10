import { supabase } from "../config/supabaseClient";
import { isValidPrcLicense, INVALID_PRC_LICENSE_MESSAGE } from "../utils/validators";

const VERIFICATION_FIELDS = "*";

export const VERIFICATION_STATUSES = ["Unverified", "Pending Review", "Verified", "Rejected", "Needs Resubmission"];

// Bulk lookup for list views (e.g. User Management's account table) --
// one query for every veterinarian row instead of one per row.
export async function getVerificationStatusesBulk(vetIds) {
  const ids = [...new Set((vetIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .select("veterinarian_id,status")
    .in("veterinarian_id", ids);
  if (error) return {};
  return Object.fromEntries((data || []).map((row) => [row.veterinarian_id, row.status]));
}

export async function getVerificationRecord(vetId) {
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .select(VERIFICATION_FIELDS)
    .eq("veterinarian_id", vetId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load verification status: ${error.message}`);
  return data || { veterinarian_id: vetId, status: "Unverified" };
}

// Vet-facing: no photos, no OCR -- the veterinarian types their own PRC
// license number. Always lands in Pending Review; nothing is saved to the
// veterinarian's profile or marked verified until an administrator
// approves it (see reviewVerification).
export async function submitVerification(vetId, profile, { licenseNumber }) {
  const value = String(licenseNumber || "").trim().toUpperCase();
  if (!isValidPrcLicense(value)) throw new Error(INVALID_PRC_LICENSE_MESSAGE);

  const payload = {
    veterinarian_id: vetId,
    status: "Pending Review",
    prc_license_number: value,
    submitted_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .upsert(payload, { onConflict: "veterinarian_id" })
    .select(VERIFICATION_FIELDS)
    .single();
  if (error) throw new Error(`Unable to submit for verification: ${error.message}`);
  return data;
}

// The one path a review decision can be made through. PRC has no public
// verification API, so there is no automated pass/fail to consult -- an
// administrator confirms the submitted license number themselves.
// Approving is also the ONLY moment the submitted license number is ever
// copied onto the veterinarian's profile -- nobody types or edits
// profiles.license_number directly, here or anywhere else.
export async function reviewVerification(vetId, { decision, reason }, actor) {
  if (actor?.role !== "admin") throw new Error("Only administrators can review veterinarian verification.");
  if (!["Verified", "Rejected", "Needs Resubmission"].includes(decision)) {
    throw new Error("Choose a valid review decision.");
  }
  if (decision !== "Verified" && !String(reason || "").trim()) {
    throw new Error("A reason is required when rejecting or requesting resubmission.");
  }

  if (decision === "Verified") {
    const record = await getVerificationRecord(vetId);
    const licenseNumber = String(record.prc_license_number || "").trim().toUpperCase();
    if (!licenseNumber) throw new Error("There is no license number on this submission to approve.");

    const { data: duplicate, error: duplicateError } = await supabase
      .from("profiles")
      .select("id")
      .eq("license_number", licenseNumber)
      .neq("id", vetId)
      .limit(1);
    if (duplicateError) throw new Error(`Unable to validate license number: ${duplicateError.message}`);
    if (duplicate?.length) {
      throw new Error("This license number is already registered to another veterinarian. Choose Needs Resubmission instead.");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ license_number: licenseNumber, updated_at: new Date().toISOString() })
      .eq("id", vetId);
    if (profileError) throw new Error(`Unable to record license number: ${profileError.message}`);
  }

  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .update({
      status: decision,
      reviewed_by: actor.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: decision === "Verified" ? null : String(reason || "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("veterinarian_id", vetId)
    .select(VERIFICATION_FIELDS)
    .single();
  if (error) throw new Error(`Unable to record review decision: ${error.message}`);

  await supabase.from("activity_logs").insert({
    user_id: actor.id,
    role: actor.role,
    action: `Verification ${decision}`,
    module: "User Management",
    related_record: vetId,
    description: `Set veterinarian verification status to ${decision}.`,
  }).then(() => {}).catch(() => {});

  return data;
}
