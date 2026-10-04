/* PawCruz push service worker.
 *
 * Shows background push notifications sent by the send-push Edge Function,
 * even when no PawCruz tab is open. When a PawCruz tab is visible, the
 * in-app toast and bell already show the notification, so nothing extra is
 * shown here. Notifications use the notification id as their tag, so the
 * in-tab browser notification and this one never stack as duplicates.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.visibilityState === "visible")) return;

      await self.registration.showNotification(data.title || "PawCruz", {
        body: data.body || "You have a new notification.",
        icon: "/web_logo.png",
        badge: "/web_logo.png",
        tag: data.tag || undefined,
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (error) {
              /* cross-origin or not controlled -- focusing is enough */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
