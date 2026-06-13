import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { shopId, licenseCode } = await request.json();
    if (!shopId || !licenseCode) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
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
      .eq("code", licenseCode)
      .single();

    if (!license) {
      return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    }

    if (license.status !== "active") {
      return NextResponse.json({ error: "Licence non active" }, { status: 400 });
    }

    if (license.shop_id) {
      return NextResponse.json({ error: "Code déjà utilisé" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await adminClient.from("licenses").update({
      shop_id: shopId,
      used_at: now,
      used_by_email: shopId,
      status: "active",
    }).eq("id", license.id);

    await adminClient.from("shops").update({
      license_id: license.id,
      license_status: license.plan === "trial" ? "trial" : "active",
      trial_started_at: license.plan === "trial" ? now : null,
    }).eq("id", shopId);

    return NextResponse.json({ success: true, plan: license.plan });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
