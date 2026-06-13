import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const POST = withErrorHandler(async (request: Request) => {
  const { shopId, licenseCode } = await request.json();
  if (!shopId || !licenseCode) {
    return apiError("Paramètres manquants", 400);
  }

  const adminClient = getAdminClient();

  const { data: license } = await adminClient
    .from("licenses")
    .select("*")
    .eq("code", licenseCode)
    .single();

  if (!license) {
    return apiError("Code invalide", 400);
  }

  if (license.status !== "active") {
    return apiError("Licence non active", 400);
  }

  if (license.shop_id) {
    return apiError("Code déjà utilisé", 400);
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

  return apiSuccess({ success: true, plan: license.plan });
});
