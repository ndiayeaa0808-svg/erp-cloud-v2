const CACHE = "erp-cache-v4";
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
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => {})
        )
      )
    )
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
  if (request.method !== "GET") return;
  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);

  // API calls: network only
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

  // Navigations: network first, cache fallback, root fallback
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
      return new Response(
        "<html><body style='display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;'><div style='text-align:center'><h1>Hors-ligne</h1><p>Cette page n'est pas disponible sans connexion.</p><p>Les pages visitées avant la coupure restent accessibles.</p></div></body></html>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  }

  // JS/CSS/images: network first, cache fallback
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
