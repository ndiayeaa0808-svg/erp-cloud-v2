const CACHE = "erp-cache-v3";

self.addEventListener("install", (event) => {
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
  if (request.method !== "GET") return;
  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);

  // API calls: network only (no cache)
  if (url.pathname.startsWith("/api/")) {
    try {
      return await fetch(request);
    } catch {
      return new Response(JSON.stringify({ error: "Hors-ligne" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Navigations: network first, cache fallback
  if (request.mode === "navigate") {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      const root = await caches.match("/");
      if (root) return root;
      return new Response("Hors-ligne", { status: 503 });
    }
  }

  // JS/CSS/images: network first (always latest when online), cache fallback when offline
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Hors-ligne", { status: 503 });
  }
}
