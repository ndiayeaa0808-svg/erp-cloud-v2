import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async () => {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from("products")
    .select("*")
    .is("deleted_at", null)
    .order("name");
  if (error) return apiError(error.message, 400);
  return apiSuccess({ data: data || [] });
});

export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  if (!body.name?.trim()) return apiError("Le nom du produit est requis", 400);

  const adminClient = getAdminClient();
  const shopId = body.shop_id && /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.shop_id)
    ? body.shop_id
    : (await adminClient.from("shops").select("id").limit(1).then(r => r.data?.[0]?.id)) || "";
  const id = crypto.randomUUID();
  const { error } = await adminClient.from("products").insert({
    id,
    shop_id: shopId,
    name: body.name,
    cat: body.cat || null,
    ref: body.ref || null,
    barcode: body.barcode || null,
    cost: body.cost ?? 0,
    retail: body.retail ?? 0,
    wholesale: body.wholesale ?? 0,
    stock: body.stock ?? 0,
    threshold: body.threshold ?? 5,
    unit: body.unit || "pcs",
    supplier: body.supplier || null,
    photo: body.photo || null,
    desc: body.desc || null,
  });
  if (error) return apiError(error.message, 400);
  return apiSuccess({ id });
});

export const PUT = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  if (!body.id) return apiError("ID requis", 400);

  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from("products")
    .update({
      name: body.name,
      cat: body.cat,
      ref: body.ref,
      barcode: body.barcode,
      cost: body.cost,
      retail: body.retail,
      wholesale: body.wholesale,
      stock: body.stock,
      threshold: body.threshold,
      unit: body.unit,
      supplier: body.supplier,
      photo: body.photo,
      desc: body.desc,
    })
    .eq("id", body.id);
  if (error) return apiError(error.message, 400);
  return apiSuccess({ success: true });
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  if (!body.id) return apiError("ID requis", 400);

  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", body.id);
  if (error) return apiError(error.message, 400);
  return apiSuccess({ success: true });
});
