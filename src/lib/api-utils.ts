import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function createAdminClient() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) {
    return { client: null, error: "Configuration serveur manquante" };
  }
  return {
    client: createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    error: null,
  };
}

export function getAdminClient() {
  const { client, error } = createAdminClient();
  if (error || !client) throw new Error(error || "Erreur serveur");
  return client;
}

export function apiError(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

export function apiSuccess(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

export function withErrorHandler(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erreur serveur" },
        { status: 500 },
      );
    }
  };
}

export const DEFAULT_ERROR = "Erreur serveur";
