self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network first to keep Supabase queries live; use an existing cache only on failure.
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(event.request);
    return cached || Response.error();
  }));
});
