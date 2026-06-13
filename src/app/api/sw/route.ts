export const runtime = "nodejs";

export async function GET() {
  return new Response('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(clients.claim()));self.addEventListener("fetch",(e)=>{e.respondWith(fetch(e.request))});', {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
