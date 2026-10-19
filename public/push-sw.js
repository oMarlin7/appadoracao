/* Notificações no celular: carregado pelo service worker do app (importScripts em vite.config.ts). */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const abs = (path) => (path ? new URL(path, self.location.origin).href : undefined)
  const title = data.title || 'Adoração'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: abs('/pwa-192x192.png'),
      // Barra de status do Android: ícone branco e transparente
      badge: abs('/notificacoes/badge.png'),
      // Arte grande (Android)
      image: abs(data.image),
      tag: data.tag || undefined,
      renotify: !!data.tag,
      lang: 'pt-BR',
      timestamp: Date.now(),
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // App já aberto: traz para frente e vai para a página do aviso.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if (client.url === url) return
        const moved = await client.navigate(url).catch(() => null)
        if (moved) return
        break
      }
      await self.clients.openWindow(url)
    })(),
  )
})
