import { supabase } from "../config/supabaseClient";

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
