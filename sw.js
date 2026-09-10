// Base para notificaciones push del futuro panel de estudiantes.
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'SynergAI', body: 'Tienes una actualización.' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/logoSAI.png',
    badge: '/logoSAI.png',
    data: { actionUrl: data.actionUrl || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.actionUrl || '/'));
});
