import { supabase } from "../config/supabaseClient";
import { todayLocal } from "./appointmentService";

// Veterinarian leave & emergency workflow. Every rule (filing window,
// overlaps, partial-day shapes, conflicts, coverage) lives in the
// Supabase functions from supabase/VET_LEAVE_REQUESTS.sql, so the web app
// and PawCruz Mobile always agree. This file only calls them.

export const LEAVE_TYPES = ["Vacation Leave", "Sick Leave", "Personal Leave", "Training / Seminar", "Other"];
export const EMERGENCY_TYPES = ["Sudden Illness", "Family Emergency", "Personal Emergency", "Other"];

const SETUP_MESSAGE = "Leave requests are not set up yet. Run supabase/VET_LEAVE_REQUESTS.sql in the Supabase SQL Editor.";

function isMissingSetup(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code) ||
    text.includes("could not find the function") ||
    text.includes("veterinarian_leave_requests");
}

function toError(error, fallback) {
  if (isMissingSetup(error)) return new Error(SETUP_MESSAGE);
  return new Error(error?.message || fallback);
}

const timeOrNull = value => (value ? String(value).slice(0, 5) : null);

// filedByStaff: staff recording leave for a vet may start it today.
export async function getLeaveImpact({ veterinarianId, requestType, startDate, endDate, isFullDay = true, startTime, endTime, excludeRequestId = null, filedByStaff = false }) {
  const { data, error } = await supabase.rpc("get_vet_leave_impact", {
    p_veterinarian_id: veterinarianId,
    p_request_type: requestType,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_is_full_day: isFullDay,
    p_start_time: timeOrNull(startTime),
    p_end_time: timeOrNull(endTime),
    p_exclude_request_id: excludeRequestId,
    p_filed_by_staff: filedByStaff
  });
  if (error) throw toError(error, "Unable to check this leave against the schedule.");
  return data;
}

export async function submitLeaveRequest({ veterinarianId, requestType, leaveType, startDate, endDate, isFullDay = true, startTime, endTime, reason }) {
  const { data, error } = await supabase.rpc("submit_vet_leave_request", {
    p_veterinarian_id: veterinarianId,
    p_request_type: requestType,
    p_leave_type: leaveType,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_is_full_day: isFullDay,
    p_start_time: timeOrNull(startTime),
    p_end_time: timeOrNull(endTime),
    p_reason: reason
  });
  if (error) throw toError(error, "Unable to file this request.");
  return data;
}

// Staff/Admin recording leave or an emergency for a vet (e.g. the vet
// called in sick). Applied at once; staff are the approvers.
export async function staffFileLeave({ staffId, veterinarianId, requestType, leaveType, startDate, endDate, isFullDay = true, startTime, endTime, reason }) {
  const { data, error } = await supabase.rpc("staff_file_vet_leave", {
    p_staff_id: staffId,
    p_veterinarian_id: veterinarianId,
    p_request_type: requestType,
    p_leave_type: leaveType,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_is_full_day: isFullDay,
    p_start_time: timeOrNull(startTime),
    p_end_time: timeOrNull(endTime),
    p_reason: reason
  });
  if (error) throw toError(error, "Unable to record this leave.");
  return data;
}

export async function cancelLeaveRequest(requestId, veterinarianId, note = "") {
  const { data, error } = await supabase.rpc("cancel_vet_leave_request", {
    p_request_id: requestId,
    p_veterinarian_id: veterinarianId,
    p_note: note || null
  });
  if (error) throw toError(error, "Unable to cancel this request.");
  return data?.request;
}

// action: "approve" | "reject" | "acknowledge" | "revoke"
export async function reviewLeaveRequest(requestId, reviewerId, action, note = "") {
  const { data, error } = await supabase.rpc("review_vet_leave_request", {
    p_request_id: requestId,
    p_reviewer_id: reviewerId,
    p_action: action,
    p_note: note || null
  });
  if (error) throw toError(error, "Unable to update this request.");
  return data?.request;
}

// startDate (optional, "YYYY-MM-DD") shows another week, e.g. a past one.
export async function getScheduleOverview(veterinarianId, days = 14, startDate = null) {
  const { data, error } = await supabase.rpc("get_vet_schedule_overview", {
    p_veterinarian_id: veterinarianId,
    p_days: days,
    ...(startDate ? { p_start_date: startDate } : {})
  });
  if (error) throw toError(error, "Unable to load your schedule.");
  return data;
}

// Every vet's hours for the next days plus the clinic hours nobody covers.
export async function getClinicCoverage(days = 14, startDate = null) {
  const { data, error } = await supabase.rpc("get_clinic_coverage", {
    p_days: days,
    ...(startDate ? { p_start_date: startDate } : {})
  });
  if (error) throw toError(error, "Unable to load the clinic schedule.");
  return data;
}

// Upcoming bookings outside their vet's current hours for a reason other
// than leave (e.g. after a shift change).
export async function getScheduleConflicts(days = 60) {
  const { data, error } = await supabase.rpc("get_schedule_conflicts", { p_days: days });
  if (error) throw toError(error, "Unable to check bookings against the schedule.");
  return data;
}

// Requests still needing staff attention, each with its live impact.
export async function getLeaveBoard() {
  const { data, error } = await supabase.rpc("get_vet_leave_board");
  if (error) throw toError(error, "Unable to load leave requests.");
  return data;
}

export async function getLeaveRequests({ veterinarianId = null, limit = 100 } = {}) {
  let query = supabase.from("veterinarian_leave_requests")
    .select(`*,
      veterinarian:profiles!veterinarian_leave_requests_veterinarian_id_fkey(id, full_name, avatar_url),
      reviewer:profiles!veterinarian_leave_requests_reviewed_by_fkey(id, full_name),
      canceller:profiles!veterinarian_leave_requests_cancelled_by_fkey(id, full_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (veterinarianId) query = query.eq("veterinarian_id", veterinarianId);
  const { data, error } = await query;
  if (error) throw toError(error, "Unable to load leave requests.");
  return data || [];
}

// Sidebar badge for Staff/Admin: pending requests plus emergencies nobody
// has acknowledged yet.
export async function getLeaveAttentionCount() {
  const { data, error } = await supabase.from("veterinarian_leave_requests")
    .select("id, status, request_type, acknowledged_at, end_date")
    .in("status", ["Pending", "Approved"]);
  if (error) throw toError(error, "Unable to load leave requests.");
  const today = todayLocal();
  return (data || []).filter(row =>
    row.status === "Pending" ||
    (row.request_type === "Emergency" && !row.acknowledged_at && row.end_date >= today)
  ).length;
}

let leaveChannelSeq = 0;
export function subscribeToLeaveChanges(callback) {
  const channel = supabase.channel(`vet-leave-${Date.now()}-${++leaveChannelSeq}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "veterinarian_leave_requests" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "veterinarian_schedule_overrides" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "veterinarian_schedules" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "veterinarian_schedule_days" }, callback)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
