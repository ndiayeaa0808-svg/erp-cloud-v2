import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const POST = withErrorHandler(async (request: Request) => {
  const { shop_id, user_id, action, entity, entity_id, data } = await request.json();
  if (!action || !entity) {
    return apiError("action et entity requis", 400);
  }
  const adminClient = getAdminClient();
  const { error } = await adminClient.from("audit_logs").insert({
    shop_id: shop_id || "default",
    user_id: user_id || "",
    action,
    entity,
    entity_id: entity_id || null,
    data: data || null,
  });
  if (error) return apiError(error.message, 400);
  return apiSuccess({ success: true });
});
