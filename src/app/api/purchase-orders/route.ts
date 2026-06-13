import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id");
  if (!shopId) return apiError("shop_id requis", 400);
  const adminClient = getAdminClient();
  let q = adminClient.from("purchase_orders").select("*").eq("shop_id", shopId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { shop_id, supplier_id, supplier_name, reference, status, items, total, tax, discount, notes } = body;
  if (!shop_id) return apiError("shop_id requis", 400);
  const adminClient = getAdminClient();
  const id = crypto.randomUUID();
  const { data, error } = await adminClient.from("purchase_orders").insert({
    id, shop_id, supplier_id, supplier_name, reference: reference || `CMD-${Date.now()}`,
    status: status || "pending", items: items || [], total: total || 0, tax: tax || 0,
    discount: discount || 0, notes, ordered_at: new Date().toISOString(),
  }).select().single();
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const PUT = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { id, status, items, total, tax, discount, received_at, notes } = body;
  if (!id) return apiError("id requis", 400);
  const adminClient = getAdminClient();
  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (items) update.items = items;
  if (total !== undefined) update.total = total;
  if (tax !== undefined) update.tax = tax;
  if (discount !== undefined) update.discount = discount;
  if (received_at) update.received_at = received_at;
  if (notes !== undefined) update.notes = notes;
  const { data, error } = await adminClient.from("purchase_orders").update(update).eq("id", id).select().single();
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});
