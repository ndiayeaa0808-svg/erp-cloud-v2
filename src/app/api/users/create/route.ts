import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";
import { createHash } from "node:crypto";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + "erp-cloud-salt").digest("hex");
}

export const POST = withErrorHandler(async (request: Request) => {
  const { login, password, name, role, shopId, perms } = await request.json();

  if (!login || !password || !name || !shopId) {
    return apiError("Champs requis manquants", 400);
  }

  const adminClient = getAdminClient();

  const email = `${login}@${shopId}.local`;

  const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { shop_id: shopId, name, login },
  });

  if (authErr) {
    if (authErr.message?.includes("already exists")) {
      return apiError("Ce login est déjà utilisé", 409);
    }
    return apiError(authErr.message, 400);
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
    return apiError(updateErr.message, 400);
  }

  return apiSuccess({ success: true, user: { id: authUser.user.id, login, name, role } });
});
