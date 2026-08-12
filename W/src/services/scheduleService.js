import { supabase } from "../config/supabaseClient";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isMissingTableError = error =>
  ["42P01", "PGRST205"].includes(error?.code) ||
  String(error?.message || "").toLowerCase().includes("veterinarian_schedule_overrides");

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
