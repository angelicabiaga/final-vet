import { supabase } from "../config/supabaseClient";

export const APPOINTMENT_STATUSES = ["Confirmed", "Completed", "Cancelled"];

const ACTIVE_STATUSES = ["Confirmed"];
const CLINIC_OPEN_TIME = "09:00";
const CLINIC_CLOSE_TIME = "19:00";
const pad = value => String(value).padStart(2, "0");
const normalizeTime = value => String(value || "").slice(0, 5);
const addTenMinutes = value => {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + 10);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatTime(time) {
  if (!time) return "—";
  const [hour, minute] = normalizeTime(time).split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export async function getOwners() {
  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, username, email")
    .eq("role", "pet_owner").eq("account_status", "active").order("full_name");
  if (error) throw new Error("Unable to load pet owners.");
  return data || [];
}

export async function getPetsByOwner(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase.from("pets")
    .select("id, pet_name, species, breed, owner_id")
    .eq("owner_id", ownerId).eq("is_archived", false).order("pet_name");
  if (error) throw new Error("Unable to load pets. Run appointment_module.sql first.");
  return data || [];
}

export async function getVeterinarians() {
  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, email, role, account_status")
    .order("full_name");
  if (error) {
    console.error("Veterinarian query error:", error);
    throw new Error(`Unable to load veterinarians: ${error.message}`);
  }
  return (data || []).filter((profile) =>
    String(profile.role || "").toLowerCase() === "veterinarian" &&
    String(profile.account_status || "").toLowerCase() === "active"
  );
}

export async function getAvailableSlots(veterinarianId, appointmentDate, excludeAppointmentId = null) {
  if (!veterinarianId || !appointmentDate || appointmentDate < todayLocal()) return [];
  const dayOfWeek = new Date(`${appointmentDate}T12:00:00`).getDay();
  const { data: override, error: overrideError } = await supabase.from("veterinarian_schedule_overrides")
    .select("start_time, end_time, is_available")
    .eq("veterinarian_id", veterinarianId).eq("schedule_date", appointmentDate).maybeSingle();

  const overrideTableMissing = ["42P01", "PGRST205"].includes(overrideError?.code) ||
    String(overrideError?.message || "").toLowerCase().includes("veterinarian_schedule_overrides");

  if (overrideError && !overrideTableMissing) {
    throw new Error("Unable to load the date-specific schedule.");
  }

  // If the optional override table was deleted, safely fall back to weekly schedules.
  let schedule = overrideTableMissing ? null : override;
  if (!override) {
    const { data: weekly, error: scheduleError } = await supabase.from("veterinarian_schedules")
      .select("start_time, end_time, is_available")
      .eq("veterinarian_id", veterinarianId).eq("day_of_week", dayOfWeek).maybeSingle();
    if (scheduleError) throw new Error("Unable to load the veterinarian schedule.");
    schedule = weekly;
  }
  if (!schedule || !schedule.is_available || !schedule.start_time || !schedule.end_time) return [];

  let bookedQuery = supabase.from("appointments").select("id, start_time")
    .eq("veterinarian_id", veterinarianId).eq("appointment_date", appointmentDate)
    .in("status", ACTIVE_STATUSES);
  if (excludeAppointmentId) bookedQuery = bookedQuery.neq("id", excludeAppointmentId);
  const { data: booked, error: bookedError } = await bookedQuery;
  if (bookedError) throw new Error("Unable to load booked times.");

  const bookedTimes = new Set((booked || []).map(item => normalizeTime(item.start_time)));
  const slots = [];
  let current = normalizeTime(schedule.start_time);
  if (current < CLINIC_OPEN_TIME) current = CLINIC_OPEN_TIME;

  // PawCruz clinic accepts appointments until closing time.
  // The last 10-minute appointment starts at 6:50 PM and ends at 7:00 PM.
  const end = CLINIC_CLOSE_TIME;
  while (current < end) {
    if (!bookedTimes.has(current)) slots.push(current);
    current = addTenMinutes(current);
  }
  return slots;
}

function validatePayload(payload) {
  if (!payload.petId) throw new Error("Select a pet.");
  if (!payload.ownerId) throw new Error("Pet owner is missing.");
  if (!payload.veterinarianId) throw new Error("Select a veterinarian.");
  if (!payload.appointmentDate || payload.appointmentDate < todayLocal()) throw new Error("Select today or a future date.");
  if (!payload.startTime) throw new Error("Select an available time.");
}

export async function createAppointment(payload) {
  validatePayload(payload);

  const latestSlots = await getAvailableSlots(
    payload.veterinarianId,
    payload.appointmentDate
  );
  if (!latestSlots.includes(normalizeTime(payload.startTime))) {
    throw new Error("That appointment time is no longer available. Please choose another time.");
  }

  const row = {
    pet_id: payload.petId,
    owner_id: payload.ownerId,
    veterinarian_id: payload.veterinarianId,
    appointment_date: payload.appointmentDate,
    start_time: payload.startTime,
    end_time: addTenMinutes(payload.startTime),
    appointment_source: payload.source || "Online",
    consultation_type: "General Consultation",
    visit_reason: payload.visitReason?.trim() || null,
    notes: payload.notes?.trim() || null,
    status: payload.status || "Confirmed",
    created_by: payload.createdBy
  };
  const { data, error } = await supabase.from("appointments").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("That appointment time was just booked. Please choose another slot.");
    throw new Error(error.message?.includes("outside") || error.message?.includes("schedule") ? error.message : "Unable to book the appointment.");
  }
  return data;
}

export async function getAppointments(filters = {}) {
  let query = supabase.from("appointments").select(`
    id, appointment_date, start_time, end_time, appointment_source, consultation_type,
    visit_reason, notes, status, created_at, updated_at,
    pet:pets(id, pet_name, species, breed),
    owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
    veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
  `).order("appointment_date", { ascending: false }).order("start_time", { ascending: true });
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.veterinarianId) query = query.eq("veterinarian_id", filters.veterinarianId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date) query = query.eq("appointment_date", filters.date);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load appointments. Check the SQL relationships.");
  return data || [];
}

export async function updateAppointmentStatus(id, status, changedBy) {
  if (!APPOINTMENT_STATUSES.includes(status)) throw new Error("Invalid appointment status.");
  const { error } = await supabase.from("appointments")
    .update({ status, created_by: changedBy }).eq("id", id);
  if (error) throw new Error("Unable to update appointment status.");
}

export async function cancelAppointment(id, ownerId) {
  const { error } = await supabase.from("appointments")
    .update({ status: "Cancelled" }).eq("id", id).eq("owner_id", ownerId)
    .eq("status", "Confirmed");
  if (error) throw new Error("Unable to cancel the appointment.");
}

export async function rescheduleAppointment(id, values, ownerId, changedBy) {
  validatePayload({ ...values, ownerId });

  const latestSlots = await getAvailableSlots(
    values.veterinarianId,
    values.appointmentDate,
    id
  );
  if (!latestSlots.includes(normalizeTime(values.startTime))) {
    throw new Error("That appointment time is no longer available. Please choose another time.");
  }

  const { error } = await supabase.from("appointments").update({
    veterinarian_id: values.veterinarianId,
    appointment_date: values.appointmentDate,
    start_time: values.startTime,
    end_time: addTenMinutes(values.startTime),
    status: "Confirmed",
    created_by: changedBy
  }).eq("id", id).eq("owner_id", ownerId).eq("status", "Confirmed");
  if (error) {
    if (error.code === "23505") throw new Error("That time is already booked.");
    throw new Error("Unable to reschedule the appointment.");
  }
}

export async function createPet(ownerId, values) {
  if (!ownerId || !values.petName?.trim() || !values.species?.trim()) throw new Error("Owner, pet name, and species are required.");
  const { data, error } = await supabase.from("pets").insert({
    owner_id: ownerId,
    pet_name: values.petName.trim(),
    species: values.species.trim(),
    breed: values.breed?.trim() || null,
    sex: values.sex || "Unknown"
  }).select("*").single();
  if (error) throw new Error("Unable to register the pet.");
  return data;
}
