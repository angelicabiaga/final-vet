import { supabase } from "../config/supabaseClient";
import { formatTime12h } from "../utils/timeFormat";
import { validateImageFile } from "../utils/validators";

// Picture attached to a broadcast (public broadcast-images bucket, see
// supabase/BROADCAST_IMAGES.sql). Returns its public URL.
export async function uploadBroadcastImage(file, actorId) {
  if (!file) return null;
  validateImageFile(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${actorId || "admin"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("broadcast-images").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`Unable to upload the picture: ${error.message}`);
  return supabase.storage.from("broadcast-images").getPublicUrl(path).data.publicUrl;
}

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
      // Only sent when a picture is attached, so plain broadcasts keep
      // working even before the image_url column exists.
      ...(values.image_url ? { image_url: values.image_url } : {}),
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
    // Same tag as the background push for this notification, so the two
    // replace each other instead of showing twice.
    new Notification(notification.title || "PawCruz", {
      body: notification.message || "You have a new notification.",
      icon: "/web_logo.png",
      tag: notification.id ? String(notification.id) : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Background web push: lets the send-push Edge Function reach this browser
// even when PawCruz isn't open. Needs REACT_APP_VAPID_PUBLIC_KEY in .env and
// notification permission already granted; silently does nothing otherwise.
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;
const PUSH_SW_URL = "/push-sw.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function webPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerWebPush(profileId) {
  if (!profileId || !VAPID_PUBLIC_KEY || !webPushSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const registration = await navigator.serviceWorker.register(PUSH_SW_URL);
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { endpoint, keys } = subscription.toJSON();
  // One row per browser; signing in as someone else re-points it to them.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      kind: "web",
      token: endpoint,
      keys,
      user_agent: navigator.userAgent.slice(0, 250),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) throw new Error(`Unable to save push subscription: ${error.message}`);
  return true;
}

// On logout: stop pushing this browser's notifications to the signed-out user.
export async function unregisterWebPush() {
  if (!webPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from("push_subscriptions").delete().eq("token", subscription.endpoint);
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
