const CACHE = 'du-v1';
const STATIC = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Web Push handler — displays an OS-native notification.
// Payload shape : { title, body, url?, icon?, tag? } JSON-encoded.
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload = {};
  try { payload = e.data.json(); } catch { payload = { title: 'Dog Universe', body: e.data.text() }; }
  const title = payload.title || 'Dog Universe';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag, // collapse same-tag notifications
    data: { url: payload.url || '/' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Click → focus existing tab or open a new one at the payload URL.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Cache-first for Next.js static assets
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    })));
    return;
  }
  // Network-first for everything else (navigation)
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
    return;
  }
  // Default: network with cache fallback
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
