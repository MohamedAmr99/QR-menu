/* Shows push notifications for new orders and waiter calls while the dashboard is closed. */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const n = data.notification || {};
  const link = (data.fcmOptions && data.fcmOptions.link) || '/';
  event.waitUntil(
    self.registration.showNotification(n.title || 'طلب جديد', {
      body: n.body || '',
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: true,
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.link || '/'));
});
