import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const productId = searchParams.get("product_id");
    if (!shopId) return NextResponse.json({ error: "shop_id requis" }, { status: 400 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    let q = adminClient.from("stock_movements").select("*").eq("shop_id", shopId);
    if (productId) q = q.eq("product_id", productId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shop_id, product_id, product_name, type, qty, before, after, reason, user_id, user_name } = body;
    if (!shop_id || !product_id || !type || qty === undefined) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await adminClient.from("stock_movements").insert({
      id: crypto.randomUUID(), shop_id, product_id, product_name, type, qty,
      before: before ?? 0, after: after ?? 0, reason, user_id, user_name,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}
