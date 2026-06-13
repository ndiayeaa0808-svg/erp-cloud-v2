import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + "erp-cloud-salt").digest("hex");
}

const ADMIN_PERMS: Record<string, boolean> = {
  dashboard: true, pos: true, products: true, sales: true, credits: true,
  clients: true, expenses: true, reports: true, cash_register: true,
  invoices: true, users: true, settings: true,
};

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) {
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Créer l'utilisateur Auth (ou récupérer l'existant)
    let authId: string;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });

    if (error) {
      if (error.message.includes("already exists") || error.message.includes("already been registered")) {
        // Récupérer l'ID existant
        const { data: existing } = await adminClient.auth.admin.listUsers();
        const found = existing?.users?.find(u => u.email === email);
        if (!found) {
          return NextResponse.json({ error: "Utilisateur déjà existant mais introuvable" }, { status: 409 });
        }
        authId = found.id;
      } else {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      authId = data.user?.id!;
    }

    // 2. Créer/Mettre à jour la ligne dans la table users
    const login = email.split("@")[0];
    const { error: upsertError } = await adminClient.from("users").upsert({
      id: authId,
      login,
      email,
      name: login,
      role: "admin",
      perms: ADMIN_PERMS,
      is_blocked: false,
      pin: hashPin("0000"),
    }, { onConflict: "id" });

    if (upsertError) {
      console.error("Setup upsert error:", upsertError);
    }

    return NextResponse.json({ success: true, id: authId, login, role: "admin", perms: ADMIN_PERMS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 },
    );
  }
}
 