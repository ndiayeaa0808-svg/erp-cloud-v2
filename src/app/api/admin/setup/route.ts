import { createClient } from "@supabase/supabase-js";
import { apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";
import { createHash } from "node:crypto";
import { ADMIN_PERMS } from "@/lib/constants";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + "erp-cloud-salt").digest("hex");
}

export const POST = withErrorHandler(async (request: Request) => {
  const { email, password } = await request.json();
  if (!email || !password) {
    return apiError("Email et mot de passe requis", 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
      const found = existing?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) {
        return apiError("Utilisateur déjà existant mais introuvable", 409);
      }
      authId = found.id;
      // Mettre à jour le mot de passe Auth pour l'utilisateur existant
      await adminClient.auth.admin.updateUserById(authId, { password });
    } else {
      return apiError(error.message, 400);
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

  return apiSuccess({ success: true, id: authId, login, role: "admin", perms: ADMIN_PERMS });
});
 