import { supabase } from "../config/supabaseClient";
import { formatTime12h } from "../utils/timeFormat";

export async function getNotifications(profileId) {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Unable to load notifications: ${error.message}`);
  }

  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function markAllRead(profileId) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`);

  if (error) throw new Error(error.message);
}

export async function sendBroadcast(values, actor) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: null,
      title: values.title.trim(),
      message: values.message.trim(),
      notification_type: "Broadcast Announcement",
      related_module: values.related_module || null,
      created_by: actor.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Unable to send broadcast: ${error.message}`);
  }

  return data;
}

export async function createTestNotification(profileId) {
  if (!profileId) throw new Error("Profile is unavailable.");
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: profileId,
      title: "PawCruz Test Notification",
      message: "Notifications are working correctly for your account.",
      notification_type: "Account Security Alert",
      related_module: "Notifications",
    })
    .select()
    .single();
  if (error) throw new Error(`Unable to create test notification: ${error.message}`);
  return data;
}

function createChannelId(profileId) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `notifications-${profileId}-${suffix}`;
}

export function subscribeNotifications(profileId, callback) {
  if (!profileId || typeof callback !== "function") {
    return () => {};
  }

  // Listen to INSERT, UPDATE, and DELETE so mobile/web read-state changes stay
  // synchronized immediately, not only newly-created notifications.
  const channel = supabase.channel(createChannelId(profileId));

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "notifications",
    },
    (payload) => {
      const notification = payload.new || payload.old;

      if (
        !notification?.recipient_id ||
        notification.recipient_id === profileId
      ) {
        callback(notification, payload.eventType, payload);
      }
    }
  );

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn(`Notification realtime channel status: ${status}`);
    }
  });

  let cleanedUp = false;

  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    void supabase.removeChannel(channel);
  };
}

export async function requestBrowserNotifications() {
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  return Notification.requestPermission();
}

export function showBrowserNotification(notification) {
  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(notification.title || "PawCruz", {
      body: notification.message || "You have a new notification.",
    });
  }
}

const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000; // notify once an appointment is within 2 hours
let lastReminderCheckAt = 0;

/**
 * No server-side cron exists in this project, so "appointment approaching"
 * reminders are checked client-side (same pattern as the inventory status
 * reconciler) -- called from NotificationBell, which is mounted for every
 * signed-in pet owner. Throttled to once per REMINDER_CHECK_INTERVAL_MS,
 * and de-duplicated per appointment via a direct query against
 * notifications before inserting, so re-checking never double-sends.
 */
export async function checkUpcomingAppointmentReminders(profile) {
  if (!profile?.id || profile.role !== "pet_owner") return;

  const now = Date.now();
  if (now - lastReminderCheckAt < REMINDER_CHECK_INTERVAL_MS) return;
  lastReminderCheckAt = now;

  const todayStr = new Date(now).toISOString().slice(0, 10);

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id,pet_id,appointment_date,start_time")
    .eq("owner_id", profile.id)
    .eq("status", "Confirmed")
    .eq("appointment_date", todayStr);

  if (error || !appointments?.length) return;

  const dueSoon = appointments.filter((appointment) => {
    const start = new Date(`${appointment.appointment_date}T${appointment.start_time}+08:00`).getTime();
    return start > now && start - now <= REMINDER_WINDOW_MS;
  });

  for (const appointment of dueSoon) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("notification_type", "Appointment Reminder")
      .eq("related_record", appointment.id)
      .limit(1);
    if (existing?.length) continue;

    const { data: pet } = await supabase
      .from("pets")
      .select("pet_name")
      .eq("id", appointment.pet_id)
      .maybeSingle();

    await supabase.from("notifications").insert({
      recipient_id: profile.id,
      title: "Upcoming Appointment",
      message: `${pet?.pet_name || "Your pet"}'s appointment starts at ${formatTime12h(appointment.start_time)} today.`,
      notification_type: "Appointment Reminder",
      related_module: "Appointments",
      related_record: appointment.id,
    });
  }
}
