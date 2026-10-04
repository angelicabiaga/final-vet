// Delivers one PawCruz notification as a background push to every browser
// (web push) and phone (Expo push) its recipient(s) registered.
//
// Called by the trg_pawcruz_queue_push database trigger with
// { notification_id }. It only ever pushes a notification that already
// exists, and claims it via notifications.push_sent_at first, so each
// notification is pushed at most once even if called repeatedly.
//
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (e.g. mailto:you@example.com). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Subscription = {
  id: string;
  profile_id: string;
  kind: "web" | "expo";
  token: string;
  keys: { p256dh: string; auth: string } | null;
  profile: { role: string | null } | null;
};

function notificationsPath(role: string | null | undefined) {
  const value = String(role || "").toLowerCase();
  if (value === "pet_owner") return "/pet-owner/notifications";
  if (["admin", "staff", "veterinarian"].includes(value)) return `/${value}/notifications`;
  return "/";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { notification_id: notificationId } = await req.json().catch(() => ({}));
    if (!notificationId) return json({ error: "notification_id is required." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim the notification so it's never pushed twice.
    const { data: notification, error: claimError } = await supabase
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", notificationId)
      .is("push_sent_at", null)
      .select("*")
      .maybeSingle();

    if (claimError) return json({ error: claimError.message }, 500);
    if (!notification) return json({ skipped: "already pushed or not found" });

    // Specific recipient, or everyone (broadcast) except whoever sent it.
    let query = supabase
      .from("push_subscriptions")
      .select("id, profile_id, kind, token, keys, profile:profiles(role)");
    if (notification.recipient_id) query = query.eq("profile_id", notification.recipient_id);
    const { data: subscriptions, error: subError } = await query;
    if (subError) return json({ error: subError.message }, 500);

    const targets = ((subscriptions || []) as unknown as Subscription[]).filter(
      (sub) => notification.recipient_id || sub.profile_id !== notification.created_by,
    );
    if (!targets.length) return json({ sent: 0 });

    const title = notification.title || "PawCruz";
    const body = notification.message || "You have a new notification.";
    // Picture attached to a broadcast (notifications.image_url), if any.
    const image = typeof notification.image_url === "string" && notification.image_url ? notification.image_url : undefined;
    const staleIds: string[] = [];
    let webSent = 0;
    let expoSent = 0;

    // ---- Web push ----
    const webTargets = targets.filter((sub) => sub.kind === "web" && sub.keys);
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (webTargets.length && vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(
        Deno.env.get("VAPID_SUBJECT") || "mailto:admin@pawcruz.business",
        vapidPublic,
        vapidPrivate,
      );
      await Promise.all(
        webTargets.map(async (sub) => {
          const payload = JSON.stringify({
            title,
            body,
            tag: notification.id,
            url: notificationsPath(sub.profile?.role),
            image,
          });
          try {
            await webpush.sendNotification({ endpoint: sub.token, keys: sub.keys! }, payload, { TTL: 60 * 60 * 24 });
            webSent += 1;
          } catch (error) {
            const status = (error as { statusCode?: number })?.statusCode;
            // 404/410: the browser unsubscribed -- forget it.
            if (status === 404 || status === 410) staleIds.push(sub.id);
          }
        }),
      );
    }

    // ---- Expo (mobile app) push ----
    const expoTargets = targets.filter((sub) => sub.kind === "expo");
    for (let i = 0; i < expoTargets.length; i += 100) {
      const chunk = expoTargets.slice(i, i + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          chunk.map((sub) => ({
            to: sub.token,
            title,
            body,
            sound: "default",
            data: { notification_id: notification.id, type: notification.notification_type, image },
            // Big picture on Android; iOS shows text unless a notification
            // service extension is added to the app.
            ...(image ? { richContent: { image } } : {}),
          })),
        ),
      }).catch(() => null);
      if (!response) continue;
      const result = await response.json().catch(() => null);
      const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data || [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") expoSent += 1;
        else if (ticket.details?.error === "DeviceNotRegistered") staleIds.push(chunk[index].id);
      });
    }

    if (staleIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ webSent, expoSent, removed: staleIds.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to send push." }, 500);
  }
});
