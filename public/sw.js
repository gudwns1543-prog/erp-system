// Service Worker - 백그라운드 푸시 알림
self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title || '(주)솔루션 ERP', {
      body: data.body || '새 알림이 있습니다',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'erp-notification',
      data: { url: data.url || '/dashboard/chat' },
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/dashboard/chat'
  e.waitUntil(
    clients.matchAll({type:'window'}).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      clients.openWindow(url)
    })
  )
})

// 포그라운드 메시지 (다른 탭에 있을 때도 알림)
self.addEventListener('message', e => {
  if (e.data?.type === 'CHAT_NOTIFICATION') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: '/favicon.svg',
      tag: 'chat-' + e.data.roomId,
      data: { url: '/dashboard/chat' },
    })
  }
})
