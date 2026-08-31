self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(self.registration.showNotification(data.title || '燃动提醒', { body: data.body || '该锻炼了，完成后记得打卡。', icon: '/icon.svg', badge: '/icon.svg', data: { url: data.url || '/?page=checkin' } }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const url = event.notification.data?.url || '/?page=checkin'
    if (clients[0]) { await clients[0].navigate(url); return clients[0].focus() }
    return self.clients.openWindow(url)
  }))
})
