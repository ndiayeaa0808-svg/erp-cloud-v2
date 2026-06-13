import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + "erp-cloud-salt").digest("hex");
}

export async function POST(request: Request) {
  try {
    const { login, password, name, role, shopId, perms } = await request.json();

    if (!login || !password || !name || !shopId) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRole || !supabaseUrl) {
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = `${login}@${shopId}.local`;

    const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { shop_id: shopId, name, login },
    });

    if (authErr) {
      if (authErr.message?.includes("already exists")) {
        return NextResponse.json({ error: "Ce login est déjà utilisé" }, { status: 409 });
      }
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { error: updateErr } = await adminClient.from("users").update({
      shop_id: shopId,
      name,
      login,
      role: role || "caissier",
      perms: perms || {},
      pass: "supabase-auth",
      pin: hashPin("0000"),
    }).eq("id", authUser.user.id);

    if (updateErr && updateErr.code !== "PGRST116") {
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: { id: authUser.user.id, login, name, role } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
