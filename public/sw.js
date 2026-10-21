// DRC Observatory Sovereign Service Worker
// Version: 1.1.0
// Provides reliable offline fallback for both desktop and mobile observatory views

const CACHE_NAME = 'drc-observatory-pwa-v13';
const SAVED_PAGE_INDEX = new URL('/__drc_saved_pages__.json', self.location.origin).href;
const MAX_CACHED_PUBLIC_PAGES = 40;

const PRECACHE_URLS = [
  '/offline?reason=offline',
  '/offline/mobile?reason=offline',
  '/manifest.webmanifest',
  '/icons/drc-mark.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/data/system-state.json',
  '/data/profile.json'
];

async function rememberPublicPage(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch {
    return;
  }
  const savedResponse = await cache.match(SAVED_PAGE_INDEX);
  const savedPaths = savedResponse ? await savedResponse.json() : [];
  const entries = (await cache.keys()).filter((key) => {
    const pathname = new URL(key.url).pathname;
    return pathname === '/' || pathname === '/cv' || pathname.startsWith('/publications/');
  });
  let excess = entries.length - MAX_CACHED_PUBLIC_PAGES;
  for (const entry of entries) {
    if (excess <= 0) break;
    const parsed = new URL(entry.url);
    const pathKey = `${parsed.pathname}${parsed.search}`;
    if (parsed.pathname === '/' || parsed.pathname === '/cv' || savedPaths.includes(pathKey)) continue;
    await cache.delete(entry);
    excess--;
  }
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || !['SAVE_PUBLIC_PAGE', 'UNSAVE_PUBLIC_PAGE'].includes(message.type)) return;

  event.waitUntil((async () => {
    const target = new URL(String(message.url || ''), self.location.origin);
    const isAllowedPath = target.origin === self.location.origin &&
      (target.pathname === '/' || target.pathname === '/cv' || target.pathname.startsWith('/publications/'));
    if (!isAllowedPath) {
      event.ports[0]?.postMessage({ ok: false, error: 'Unsupported public page' });
      return;
    }

    const cache = await caches.open(CACHE_NAME);
    const savedResponse = await cache.match(SAVED_PAGE_INDEX);
    const savedPaths = savedResponse ? await savedResponse.json() : [];
    const pathKey = `${target.pathname}${target.search}`;

    if (message.type === 'UNSAVE_PUBLIC_PAGE') {
      await cache.put(SAVED_PAGE_INDEX, new Response(JSON.stringify(savedPaths.filter((item) => item !== pathKey)), {
        headers: { 'Content-Type': 'application/json' },
      }));
      event.ports[0]?.postMessage({ ok: true, saved: false });
      return;
    }

    try {
      const response = await fetch(target.href, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.headers.has('X-DRC-Offline-Page')) {
        event.ports[0]?.postMessage({ ok: false, error: 'Page could not be saved while offline or under maintenance' });
        return;
      }
      await rememberPublicPage(cache, target.href, response.clone());
      if (!savedPaths.includes(pathKey)) savedPaths.push(pathKey);
      await cache.put(SAVED_PAGE_INDEX, new Response(JSON.stringify(savedPaths), {
        headers: { 'Content-Type': 'application/json' },
      }));
      event.ports[0]?.postMessage({ ok: true, saved: true });
    } catch {
      event.ports[0]?.postMessage({ ok: false, error: 'Page could not be saved while offline or under maintenance' });
    }
  })());
});

// Precache essential offline fallback screens during service worker installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Fetch each asset individually so one failure does not prevent caching the rest
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (err) {
            console.warn('[DRC SW] Failed to precache:', url, err);
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate immediately and claim existing open tabs
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const currentCache = await caches.open(CACHE_NAME);
      for (const key of keys) {
        if (key === CACHE_NAME || !key.startsWith('drc-observatory-')) continue;
        const oldCache = await caches.open(key);
        for (const request of await oldCache.keys()) {
          if (await currentCache.match(request)) continue;
          const response = await oldCache.match(request);
          if (response) await currentCache.put(request, response);
        }
        await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

// Intercept network requests
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Topmost Auth Priority: Never intercept non-GET requests or ANY admin routes / admin APIs
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin/')) return;
  if (url.pathname === '/api/status') return; // Always hit live network for status checks

  // 2. Navigation requests: Network-First with Dedicated Desktop/Mobile Offline Fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(async (response) => {
          // Keep successfully visited public pages available for offline reading.
          if (response.ok && response.type === 'basic' && !response.headers.has('X-DRC-Offline-Page')) {
            const cache = await caches.open(CACHE_NAME);
            await rememberPublicPage(cache, req, response.clone());
          }
          return response;
        })
        .catch(async () => {
          // Network failed (physically offline or connection dropped)
          const cache = await caches.open(CACHE_NAME);
          const visitedPage = await cache.match(req);
          if (visitedPage) return visitedPage;
          if (url.pathname === '/' && url.search) {
            const cachedHome = await cache.match(new URL('/', url.origin).href);
            if (cachedHome) return cachedHome;
          }

          const userAgent = req.headers.get('user-agent') || navigator.userAgent || '';
          const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

          // Dedicated mobile offline page for handheld devices
          if (isMobile) {
            const mobileCached = await cache.match('/offline/mobile?reason=offline') || await cache.match('/offline/mobile');
            if (mobileCached) return mobileCached;
          }

          // Desktop offline page for observatory workstations
          const desktopCached = await cache.match('/offline?reason=offline') || await cache.match('/offline');
          if (desktopCached) return desktopCached;

          // Fallback match to whichever offline page is in cache
          const anyCached = await cache.match('/offline/mobile?reason=offline') ||
                            await cache.match('/offline?reason=offline') ||
                            await cache.match('/offline/mobile') ||
                            await cache.match('/offline');
          if (anyCached) return anyCached;

          // Resilient inline fallback if cache was somehow cleared
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>You are offline! · Duncan R. Cordry</title>
              <style>
                body { margin:0; min-height:100vh; background:#03050c; color:#f1f5f9; display:flex; align-items:center; justify-content:center; font-family:serif; text-align:center; padding:1.5rem; }
                .card { max-width:440px; border:1px solid rgba(226,232,240,0.15); padding:2rem 1.75rem; border-radius:18px; background:rgba(15,23,42,0.85); box-shadow:0 25px 60px rgba(0,0,0,0.9); }
                h1 { color:#ffffff; font-size:1.6rem; margin-bottom:0.6rem; font-weight:500; }
                p { color:#cbd5e1; font-size:0.92rem; line-height:1.6; }
                button { margin-top:1.5rem; padding:0.75rem 1.25rem; background:linear-gradient(135deg, rgba(212,175,55,0.25) 0%, rgba(184,147,43,0.15) 100%); color:#ffd700; border:1px solid rgba(212,175,55,0.45); border-radius:10px; font-weight:600; cursor:pointer; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>You are offline!</h1>
                <p>The astronomical observatory link is currently unreachable. Your local folios and star charts remain preserved.</p>
                <button onclick="window.location.reload()">Check Connection / Reconnect</button>
              </div>
            </body>
            </html>`,
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        })
    );
    return;
  }

  // Public read API: stale-while-revalidate for quick startup and offline summaries.
  if (url.pathname.startsWith('/api/public/v1/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req).then((response) => {
          if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
            return cache.put(req, response.clone()).then(() => response);
          }
          return response;
        }).catch(() => null);
        if (cached) {
          event.waitUntil(fresh.then(() => undefined));
          return cached;
        }
        return await fresh || new Response(JSON.stringify({ error: 'offline', cached: false }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      })
    );
    return;
  }

  // 3. Static assets: CSS, JS, fonts, and images (Stale-While-Revalidate)
  if (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/images/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.destination === 'font'
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => null);

        return cachedResponse || fetchPromise.then((res) => res || new Response('', { status: 408 }));
      })
    );
  }
});
