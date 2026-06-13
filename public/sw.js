const CACHE = "erp-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/login",
  "/pos",
  "/products",
  "/sales",
  "/clients",
  "/credits",
  "/expenses",
  "/invoices",
  "/settings",
  "/cash-register",
  "/reports",
  "/employees",
  "/users",
  "/offline",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin && !url.href.includes("supabase")) {
    return;
  }

  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.match(/\.(js|css|woff2|png|jpg|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname === "/" || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Hors-ligne", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Hors-ligne", { status: 503 });
  }
}
