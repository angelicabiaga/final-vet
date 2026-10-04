import { supabase } from "../config/supabaseClient";

// Emergency doctor change confirmed by the pet owner. The rules (validated
// free times, holds, check-in on confirm) live in
// supabase/QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql, shared with PawCruz Mobile.

export const CHANGE_REASONS = [
  "Doctor Unavailable (Emergency)",
  "Doctor On Leave / Sick",
  "Doctor Overbooked / At Capacity",
  "Doctor Called Away",
  "Other"
];

const SETUP_MESSAGE = "Doctor changes are not set up yet. Run supabase/QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql in the Supabase SQL Editor.";

function toError(error, fallback) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code) || text.includes("could not find the function") || text.includes("queue_doctor_offers")) {
    return Object.assign(new Error(SETUP_MESSAGE), { setupMissing: true });
  }
  return new Error(error?.message || fallback);
}

// Pet owners never see the SQL setup instruction meant for the clinic.
export function ownerErrorMessage(error) {
  if (error?.setupMissing) {
    console.warn(SETUP_MESSAGE);
    return "Rebooking or cancelling here isn't available right now. Please ask the clinic front desk.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

const timeOrNull = value => (value ? String(value).slice(0, 5) : null);

// Attaches pet names and the doctors' / owner's names to offer rows.
async function hydrate(offers) {
  if (!offers.length) return [];
  const petIds = [...new Set(offers.flatMap(offer => offer.pet_ids || []))];
  const profileIds = [...new Set(offers.flatMap(offer => [offer.owner_id, offer.original_veterinarian_id, offer.proposed_veterinarian_id]).filter(Boolean))];
  const [{ data: pets }, { data: profiles }] = await Promise.all([
    supabase.from("pets").select("id, pet_name, photo_url").in("id", petIds),
    supabase.from("profiles").select("id, full_name").in("id", profileIds)
  ]);
  const petMap = new Map((pets || []).map(pet => [pet.id, pet]));
  const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
  return offers.map(offer => ({
    ...offer,
    pets: (offer.pet_ids || []).map(id => petMap.get(id)).filter(Boolean),
    owner: profileMap.get(offer.owner_id) || null,
    original_veterinarian: profileMap.get(offer.original_veterinarian_id) || null,
    proposed_veterinarian: profileMap.get(offer.proposed_veterinarian_id) || null
  }));
}

export async function getPendingDoctorOffers() {
  const { data, error } = await supabase.from("queue_doctor_offers").select("*").eq("status", "Pending").order("created_at");
  if (error) throw toError(error, "Unable to load doctor changes.");
  return hydrate(data || []);
}

export async function getMyDoctorOffers(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase.from("queue_doctor_offers").select("*").eq("owner_id", ownerId).eq("status", "Pending").order("created_at");
  if (error) throw toError(error, "Unable to load your visit updates.");
  return hydrate(data || []);
}

// My Queue self-service: free times (with every doctor) for rebooking a
// waiting ticket's visit on a date.
export async function getQueueVisitRescheduleOptions(queueEntryId, date) {
  const { data, error } = await supabase.rpc("get_queue_visit_reschedule_options", { p_queue_entry_id: queueEntryId, p_date: date });
  if (error) throw toError(error, "Unable to load available times.");
  return data;
}

// The owner cancels ("cancel") or rebooks ("reschedule") their own waiting visit.
export async function ownerChangeQueueVisit({ ownerId, queueEntryId, action, date = null, veterinarianId = null, startTime = null }) {
  const { data, error } = await supabase.rpc("owner_change_queue_visit", {
    p_owner_id: ownerId,
    p_queue_entry_id: queueEntryId,
    p_action: action,
    p_new_date: date,
    p_new_veterinarian_id: veterinarianId,
    p_new_time: startTime ? String(startTime).slice(0, 5) : null
  });
  if (error) throw toError(error, action === "cancel" ? "Unable to cancel the visit." : "Unable to rebook the visit.");
  return data;
}

// Check-in cards and waiting tickets whose doctor can't see them as booked.
export async function getQueueDoctorAlerts(date) {
  const { data, error } = await supabase.rpc("get_queue_doctor_alerts", { p_date: date || null });
  if (error) throw toError(error, "Unable to check doctors' availability.");
  return data || { appointments: [], queue: [] };
}

export async function getDoctorChangeOptions({ queueEntryId = null, appointmentIds = null }) {
  const { data, error } = await supabase.rpc("get_doctor_change_options", {
    p_queue_entry_id: queueEntryId,
    p_appointment_ids: appointmentIds
  });
  if (error) throw toError(error, "Unable to load available doctors.");
  return data;
}

export async function proposeDoctorChange({ staffId, queueEntryId = null, appointmentIds = null, veterinarianId, startTime, reason, notes }) {
  const { data, error } = await supabase.rpc("propose_doctor_change", {
    p_staff_id: staffId,
    p_queue_entry_id: queueEntryId,
    p_appointment_ids: appointmentIds,
    p_new_veterinarian_id: veterinarianId,
    p_start_time: timeOrNull(startTime),
    p_reason: reason,
    p_notes: notes || null
  });
  if (error) throw toError(error, "Unable to send the doctor change.");
  return data;
}

// action: "confirm" | "reschedule" | "cancel" (owner, or staff at the counter)
export async function respondDoctorOffer(offerId, actorId, action, { date = null, veterinarianId = null, startTime = null, note = null } = {}) {
  const { data, error } = await supabase.rpc("respond_doctor_offer", {
    p_offer_id: offerId,
    p_actor_id: actorId,
    p_action: action,
    p_new_date: date,
    p_new_veterinarian_id: veterinarianId,
    p_new_time: timeOrNull(startTime),
    p_note: note
  });
  if (error) throw toError(error, "Unable to save your answer.");
  return data;
}

export async function withdrawDoctorOffer(offerId, staffId) {
  const { data, error } = await supabase.rpc("withdraw_doctor_offer", { p_offer_id: offerId, p_staff_id: staffId });
  if (error) throw toError(error, "Unable to withdraw the doctor change.");
  return data;
}

export async function getRescheduleOptions(offerId, date) {
  const { data, error } = await supabase.rpc("get_doctor_offer_reschedule_options", { p_offer_id: offerId, p_date: date });
  if (error) throw toError(error, "Unable to load available times.");
  return data;
}
