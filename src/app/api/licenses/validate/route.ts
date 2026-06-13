import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code?.trim()) {
      return NextResponse.json({ valid: false, error: "Code requis" }, { status: 400 });
    }

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) {
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: license } = await adminClient
      .from("licenses")
      .select("*")
      .eq("code", code.trim())
      .single();

    if (!license) {
      return NextResponse.json({ valid: false, error: "Code de licence invalide" });
    }

    if (license.status !== "active") {
      return NextResponse.json({ valid: false, error: "Cette licence n'est plus active" });
    }

    if (license.shop_id) {
      return NextResponse.json({ valid: false, error: "Ce code a déjà été utilisé" });
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "Cette licence a expiré" });
    }

    return NextResponse.json({
      valid: true,
      plan: license.plan,
      installation_fee_paid: license.installation_fee_paid,
      expires_at: license.expires_at,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
