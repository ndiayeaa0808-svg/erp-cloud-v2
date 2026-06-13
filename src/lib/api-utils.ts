import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function getAdminClient() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) {
    throw new Error("Configuration serveur manquante");
  }
  return createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
