self.addEventListener("push", (event) => {
  let payload = { title: "Sprouts Valley", body: "New notification", url: "/staff/invoices" };
  try {
    payload = { ...payload, ...event.data?.json() };
  } catch {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Sprouts Valley", {
      body: payload.body || "",
      icon: "/staff/vite.svg",
      badge: "/staff/vite.svg",
      data: { url: payload.url || "/staff/invoices" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/staff/invoices";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
