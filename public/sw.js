/* Web Push service worker for Syndica Sync.
 *
 * Kept deliberately tiny and dependency-free: it only handles incoming push
 * events (show a notification) and clicks (focus an existing tab or open the
 * deep link). All notification content is decided server-side and sent as the
 * push payload — the SW just renders it.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Syndica Sync";
  const options = {
    body: data.body || "",
    icon: "/syndica-icon.svg",
    badge: "/syndica-icon.svg",
    // Collapse repeat notifications about the same conversation into one,
    // rather than stacking a tower of them.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an already-open app tab and navigate it, instead of opening a
      // duplicate window, when one exists.
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
