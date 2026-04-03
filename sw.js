// ═══════════════════════════════════════════════
// GEMATRIA PRO — Service Worker
// Strategy: Cache-first for app shell, network-first for Google Fonts
// Version bump CACHE_NAME to force update on new releases
// ═══════════════════════════════════════════════

const CACHE_NAME = 'gematria-pro-v1.0.0';
const FONT_CACHE = 'gematria-fonts-v1';

// Core app shell — everything needed to run fully offline
const APP_SHELL = [
  './gematria-pro.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Google Fonts URLs to cache on first load
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ── INSTALL: cache app shell immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Installing — caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
  );
});

// ── ACTIVATE: purge old caches on version bump
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== FONT_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── FETCH: route requests intelligently
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Google Fonts — cache-first, long TTL
  if (FONT_ORIGINS.some(origin => url.origin === new URL(origin).origin)) {
    event.respondWith(fontStrategy(request));
    return;
  }

  // External CDN / analytics / anything else non-local — network only, fail silently
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // App shell — cache-first, fall back to network, then offline page
  event.respondWith(appShellStrategy(request));
});

// Cache-first for app shell
async function appShellStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Fully offline and not cached — return the main app shell
    const fallback = await caches.match('./gematria-pro.html');
    return fallback || new Response('<h1>Offline</h1>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Cache-first for fonts (stale-while-revalidate style)
async function fontStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(FONT_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 408 });
  }
}

// ── MESSAGE: allow app to trigger SW update check
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
