import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function computeExpiry(plan: string): string | null {
  const now = new Date();
  switch (plan) {
    case "trial": return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case "monthly": return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    case "quarterly": return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    case "semi_annual": return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
    case "lifetime": return null;
    default: return null;
  }
}

export async function POST(request: Request) {
  try {
    const { plan, notes } = await request.json();

    if (!["trial", "monthly", "quarterly", "semi_annual", "lifetime"].includes(plan)) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) {
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      const { data: existing } = await adminClient.from("licenses").select("id").eq("code", code).maybeSingle();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const expiresAt = computeExpiry(plan);

    const { data: license, error } = await adminClient.from("licenses").insert({
      code,
      plan,
      status: "active",
      expires_at: expiresAt,
      notes: notes || null,
    }).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ code, plan, expires_at: expiresAt });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
