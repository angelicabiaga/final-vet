import { supabase } from "../config/supabaseClient";
import { validateImageFile, isValidPrcLicense } from "../utils/validators";

const BUCKET = "veterinarian-verification";
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes -- generated fresh every time a viewer opens the review panel

const VERIFICATION_FIELDS = "*";

// Nothing in this file ever calls getPublicUrl on the verification bucket
// (it's private -- that call would just fail) and nothing here ever logs
// a path, a signed URL, or file contents. Only non-sensitive status text
// reaches console/activity_logs.

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

// Every viewer needs a fresh set of signed URLs -- callers must be either
// the veterinarian themselves or an admin; every other caller is refused
// before a single storage call is made.
export async function getSignedVerificationUrls(record, actor) {
  const isOwner = actor?.id === record?.veterinarian_id;
  const isAdmin = actor?.role === "admin";
  if (!isOwner && !isAdmin) throw new Error("You are not authorized to view these documents.");

  const paths = {
    idFront: record?.id_front_path,
    idBack: record?.id_back_path,
    faceScan: record?.face_scan_path,
  };

  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      if (!path) return [key, null];
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) return [key, null];
      return [key, data?.signedUrl || null];
    })
  );

  return Object.fromEntries(entries);
}

export async function uploadVerificationImage(vetId, file, kind) {
  validateImageFile(file);
  const extension = file.name.split(".").pop() || "jpg";
  const path = `${vetId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`Unable to upload ${kind.replace("-", " ")}: ${error.message}`);
  return path;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Loose but real: every word on the profile's full name must appear
// somewhere in the name typed from the card (order-independent, so
// "Dr. Juan D. Cruz" still matches a card reading "Juan Dela Cruz").
function namesReasonablyMatch(profileName, cardName) {
  const profileWords = normalizeName(profileName).split(" ").filter((w) => w.length > 1);
  const cardWords = new Set(normalizeName(cardName).split(" "));
  if (!profileWords.length) return true;
  return profileWords.every((word) => cardWords.has(word));
}

// The license number is never typed by anyone -- it comes only from OCR
// run on the uploaded PRC ID (see prcOcrService) and is carried through
// untouched. Name, profession, and the two dates also start from that
// same OCR pass, but the veterinarian may correct them before submitting
// (OCR on a real card photo is not perfectly reliable) -- so by the time
// this runs, "extracted" may be a mix of OCR output and the
// veterinarian's own typed corrections to those four fields only.
function validateExtractedSubmission({ profile, extracted }) {
  const licenseNumber = String(extracted?.licenseNumber || "").trim();
  if (!licenseNumber) {
    throw new Error("A license number could not be read from this ID. Upload a clearer, well-lit photo of the front of the card.");
  }
  if (!isValidPrcLicense(licenseNumber)) {
    throw new Error("The license number read from this ID doesn't look valid. Upload a clearer photo.");
  }

  const name = String(extracted?.nameCandidate || "").trim();
  if (!name) throw new Error("Enter the full name as printed on the PRC ID.");
  if (!namesReasonablyMatch(profile.full_name, name)) {
    throw new Error("The name entered does not appear to match the name on this profile.");
  }

  const profession = String(extracted?.profession || "").trim();
  if (!profession) throw new Error("Enter the profession as printed on the PRC ID.");
  if (!/veterin/i.test(profession)) throw new Error("The profession must indicate Veterinarian / Veterinary Medicine.");

  if (!extracted?.registrationDate) throw new Error("Enter the PRC registration date.");
  if (!extracted?.expirationDate) throw new Error("Enter the PRC expiration date.");
  const registration = new Date(`${extracted.registrationDate}T00:00:00`);
  const expiration = new Date(`${extracted.expirationDate}T00:00:00`);
  if (Number.isNaN(registration.getTime()) || Number.isNaN(expiration.getTime())) {
    throw new Error("Enter valid PRC registration and expiration dates.");
  }
  if (expiration <= registration) throw new Error("The expiration date must be after the registration date.");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expiration < today) throw new Error("This PRC ID has already expired. A valid, unexpired ID is required.");
}

// Vet-facing: uploads must already be done (idFrontPath/idBackPath are
// storage paths from uploadVerificationImage), OCR must have already run
// (extracted starts from prcOcrService.parsePrcFields, with name/
// profession/dates possibly corrected by the veterinarian), and explicit
// consent must have been recorded before the face scan step even ran.
// Always lands in Pending Review -- there is no automated pass/fail here,
// and nothing is saved to the veterinarian's profile or marked verified
// until an administrator approves it.
export async function submitVerification(vetId, profile, values) {
  if (!values.consentGivenAt) throw new Error("Face-scan consent is required before submitting for review.");
  if (!values.idFrontPath || !values.idBackPath) throw new Error("Upload both the front and back of your PRC ID.");
  if (!values.faceScanPath) throw new Error("Capture a live face scan before submitting for review.");

  const extracted = values.extracted || {};
  validateExtractedSubmission({ profile, extracted });

  const payload = {
    veterinarian_id: vetId,
    status: "Pending Review",
    id_front_path: values.idFrontPath,
    id_back_path: values.idBackPath,
    face_scan_path: values.faceScanPath,
    prc_name_on_card: String(extracted.nameCandidate).trim(),
    prc_license_number: String(extracted.licenseNumber).trim().toUpperCase(),
    prc_profession: String(extracted.profession).trim(),
    prc_registration_date: extracted.registrationDate,
    prc_expiration_date: extracted.expirationDate,
    ocr_raw_text: extracted.rawText || null,
    ocr_confidence: Number.isFinite(values.ocrConfidence) ? values.ocrConfidence : null,
    consent_given_at: values.consentGivenAt,
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

// The one path a review decision can be made through. Uncertain cases
// belong in "Needs Resubmission", not "Rejected" -- the UI should never
// wire a bare automated signal to Rejected on its own, and this function
// has no automated signal to consult in the first place. Approving is
// also the ONLY moment the OCR-read license number is ever copied onto
// the veterinarian's profile -- nobody types or edits it, here or
// anywhere else.
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
    if (!licenseNumber) throw new Error("There is no OCR-read license number on this submission to approve.");

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
