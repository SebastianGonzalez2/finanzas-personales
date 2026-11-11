/* global self, clients */
self.addEventListener("push", (event) => {
  if (event.data?.text() !== "card-due") return;
  event.waitUntil(
    self.registration.showNotification("Finanzas personales", {
      body: "Tenés un aviso de vencimiento de tarjeta. Abrí Avisos para ver el detalle.",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/avisos"));
});
