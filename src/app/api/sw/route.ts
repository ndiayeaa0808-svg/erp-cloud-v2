import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const swPath = join(process.cwd(), "public", "sw.js");
  const body = readFileSync(swPath, "utf-8");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
