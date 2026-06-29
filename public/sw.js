// calorie.monster service worker — offline support for a static site.
// Strategy:
//   • app shell + static assets (_astro, css, js, icons, manifest): cache-first + SWR
//   • page navigations & search-data JSON: network-first, fall back to cache,
//     cache successful responses so visited foods work offline
//   • trim cache to a sane ceiling
const VERSION = 'v1';
const SHELL = `calorie-shell-${VERSION}`;
const PAGES = `calorie-pages-${VERSION}`;
const SHELL_ASSETS = [
  '/',
  '/en',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/og.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return /\/_astro\/|\.css$|\.js$|\.svg$|\.png$|\.webmanifest$|\/icons\//.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // skip cross-origin (ad networks etc.)

  // Static assets → cache-first, revalidate in background.
  if (isStatic(url)) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(request);
        const fetchPromise = fetch(request).then((res) => { if (res && res.ok) c.put(request, res.clone()); return res; }).catch(() => hit);
        return hit || fetchPromise;
      }),
    );
    return;
  }

  // Navigations + JSON pages → network-first, cache fallback, trim cache.
  if (request.mode === 'navigate' || /\.json$/.test(url.pathname)) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const cache = await caches.open(PAGES);
            cache.put(request, res.clone());
            trim(cache, 60);
          }
          return res;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            const home = await caches.match('/');
            return home || (await caches.match('/offline.html')) || Response.error();
          }
          return Response.error();
        }
      })(),
    );
  }
});

// Best-effort LRU-ish trim: keep the most recent entries under the limit.
async function trim(cache, limit) {
  try {
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
  } catch {}
}
