/* Kompass: show pushed reminders and open the app when one is tapped. Loaded by the Workbox service worker. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Kompass', body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kompass', {
      body: data.body || '',
      tag: data.tag,
      icon: scope + 'icon-192.png',
      badge: scope + 'icon-192.png',
      data: { url: scope + (data.url || '#/') },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          c.navigate(url).catch(() => {})
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
