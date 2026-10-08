import { supabase } from "../config/supabaseClient";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Only a genuinely missing table counts -- not every error whose text happens
// to mention the table name (check-constraint messages do too).
const isMissingTableError = error => {
  if (["42P01", "PGRST205"].includes(error?.code)) return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("veterinarian_schedule_overrides") &&
    (message.includes("does not exist") || message.includes("could not find the table"));
};

// A database rule rejected the hours (code 23514 = check constraint).
const isHoursRuleError = error =>
  error?.code === "23514" || /check constraint|clinic hours/i.test(String(error?.message || ""));

export async function getAllSchedules() {
  const { data, error } = await supabase
    .from("veterinarian_schedules")
    .select("*, veterinarian:profiles!veterinarian_schedules_veterinarian_id_fkey(id, full_name, email)")
    .order("veterinarian_id")
    .order("day_of_week");

  if (error) throw new Error("Unable to load veterinarian schedules. Run REPAIR_veterinarian_schedules.sql in Supabase.");
  return data || [];
}

export async function saveWeeklySchedule(row) {
  const payload = {
    veterinarian_id: row.veterinarianId,
    day_of_week: Number(row.dayOfWeek),
    start_time: row.startTime,
    end_time: row.endTime,
    is_available: row.isAvailable
  };

  const { error } = await supabase
    .from("veterinarian_schedules")
    .upsert(payload, { onConflict: "veterinarian_id,day_of_week" });

  if (error) throw new Error(error.message || "Unable to save weekly schedule.");
}

export async function getScheduleOverrides() {
  const { data, error } = await supabase
    .from("veterinarian_schedule_overrides")
    .select("*, veterinarian:profiles!veterinarian_schedule_overrides_veterinarian_id_fkey(id, full_name)")
    .order("schedule_date", { ascending: true });

  // Booking and weekly schedules remain usable even if the override table was deleted.
  if (error && isMissingTableError(error)) return [];
  if (error) throw new Error("Unable to load date schedules. Run REPAIR_veterinarian_schedules.sql in Supabase.");
  return data || [];
}

// Publishes a vet's schedule (VET_SCHEDULE_CALENDAR.sql): the chosen
// weekdays (0 = Sunday) from startDate to endDate at the given hours, every
// other day in the range a day off. Pet owners can only book dates that
// have a created schedule.
export async function createVetSchedule({ staffId, veterinarianId, startDate, endDate, weekdays, startTime, endTime }) {
  const { data, error } = await supabase.rpc("create_vet_schedule", {
    p_staff_id: staffId,
    p_veterinarian_id: veterinarianId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_weekdays: weekdays,
    p_start_time: String(startTime).slice(0, 5),
    p_end_time: String(endTime).slice(0, 5)
  });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) {
      throw new Error("Create Schedule is not set up yet. Run supabase/VET_SCHEDULE_CALENDAR.sql in the Supabase SQL Editor.");
    }
    throw new Error(error.message || "Unable to create the schedule.");
  }
  return data;
}

// The last date each vet has a created schedule for: { vetId: "YYYY-MM-DD" }.
export async function getScheduledUntil() {
  const { data, error } = await supabase.from("veterinarian_schedule_days")
    .select("veterinarian_id, schedule_date")
    .order("schedule_date", { ascending: false })
    .limit(1000);
  if (error) return {};
  const result = {};
  (data || []).forEach(row => { if (!result[row.veterinarian_id]) result[row.veterinarian_id] = row.schedule_date; });
  return result;
}

export async function saveScheduleOverride(row) {
  const payload = {
    veterinarian_id: row.veterinarianId,
    schedule_date: row.scheduleDate,
    is_available: row.isAvailable,
    start_time: row.isAvailable ? row.startTime : null,
    end_time: row.isAvailable ? row.endTime : null,
    reason: row.reason?.trim() || null,
    created_by: row.createdBy
  };

  const { error } = await supabase
    .from("veterinarian_schedule_overrides")
    .upsert(payload, { onConflict: "veterinarian_id,schedule_date" });

  if (error && isMissingTableError(error)) {
    throw new Error("Date schedule table is missing. Run supabase/REPAIR_veterinarian_schedules.sql first.");
  }
  if (error && isHoursRuleError(error)) {
    throw new Error("Adjusted hours must be within clinic hours (9:00 AM – 7:00 PM), and the end time must be after the start time.");
  }
  if (error) throw new Error(error.message || "Unable to save date schedule.");
}

export async function deleteScheduleOverride(id) {
  const { error } = await supabase
    .from("veterinarian_schedule_overrides")
    .delete()
    .eq("id", id);

  if (error && isMissingTableError(error)) return;
  if (error) throw new Error("Unable to remove date schedule.");
}
