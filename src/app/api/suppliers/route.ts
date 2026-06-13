import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id");
  const search = searchParams.get("search");
  if (!shopId) return apiError("shop_id requis", 400);
  const adminClient = getAdminClient();
  let q = adminClient.from("suppliers").select("*").eq("shop_id", shopId);
  if (search) q = q.or(`name.ilike.%${search}%,contact.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, error } = await q.order("name");
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { shop_id, name, contact, phone, email, address, notes } = body;
  if (!shop_id || !name) return apiError("shop_id et name requis", 400);
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.from("suppliers").insert({
    id: crypto.randomUUID(), shop_id, name, contact, phone, email, address, notes,
  }).select().single();
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const PUT = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { id, name, contact, phone, email, address, notes, debt } = body;
  if (!id) return apiError("id requis", 400);
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.from("suppliers").update({ name, contact, phone, email, address, notes, debt }).eq("id", id).select().single();
  if (error) return apiError(error.message, 500);
  return apiSuccess({ data });
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return apiError("id requis", 400);
  const adminClient = getAdminClient();
  const { error } = await adminClient.from("suppliers").delete().eq("id", id);
  if (error) return apiError(error.message, 500);
  return apiSuccess({ success: true });
});
