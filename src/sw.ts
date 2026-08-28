/// <reference lib="webworker" />
// Service worker customizado — igual ao gerado automaticamente antes (mesmo
// precache/cache de runtime, via injectManifest), mas com um pedaço a mais: os
// eventos "push" e "notificationclick", que o modo automático (generateSW) não deixa
// adicionar. Necessário pro recurso de "avisar a equipe quando chega agendamento novo".
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
// @ts-ignore
self.__WB_DISABLE_DEV_LOGS = true;

cleanupOutdatedCaches();
// @ts-ignore — injetado pelo vite-plugin-pwa na hora do build
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) =>
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com'),
  new NetworkOnly()
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.endsWith('.glb'),
  new StaleWhileRevalidate({
    cacheName: 'models-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Mostra a notificação de verdade quando uma push chega — mesmo com o app fechado
self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Clínica Digital', body: event.data?.text() || 'Você tem uma notificação nova' };
  }
  const title = payload.title || 'Clínica Digital';
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: '/icons/icon-192-v4.png',
    badge: '/icons/icon-192-v4.png',
    data: { url: payload.url || '/#app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação, abre o app (ou foca na aba já aberta, se já tiver uma)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/#app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
