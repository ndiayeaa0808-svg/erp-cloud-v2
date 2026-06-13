import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id");
  const productId = searchParams.get("product_id");
  if (!shopId) return apiError("shop_id requis", 400);
  const adminClient = getAdminClient();
  let q = adminClient.from("stock_movements").select("*").eq("shop_id", shopId);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { shop_id, product_id, product_name, type, qty, before, after, reason, user_id, user_name } = body;
  if (!shop_id || !product_id || !type || qty === undefined) {
    return apiError("Champs requis manquants", 400);
  }
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.from("stock_movements").insert({
    id: crypto.randomUUID(), shop_id, product_id, product_name, type, qty,
    before: before ?? 0, after: after ?? 0, reason, user_id, user_name,
  }).select().single();
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});
