import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    if (!shopId) return NextResponse.json({ error: "shop_id requis" }, { status: 400 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    let q = adminClient.from("purchase_orders").select("*").eq("shop_id", shopId);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shop_id, supplier_id, supplier_name, reference, status, items, total, tax, discount, notes } = body;
    if (!shop_id) return NextResponse.json({ error: "shop_id requis" }, { status: 400 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    const id = crypto.randomUUID();
    const { data, error } = await adminClient.from("purchase_orders").insert({
      id, shop_id, supplier_id, supplier_name, reference: reference || `CMD-${Date.now()}`,
      status: status || "pending", items: items || [], total: total || 0, tax: tax || 0,
      discount: discount || 0, notes, ordered_at: new Date().toISOString(),
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, status, items, total, tax, discount, received_at, notes } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (items) update.items = items;
    if (total !== undefined) update.total = total;
    if (tax !== undefined) update.tax = tax;
    if (discount !== undefined) update.discount = discount;
    if (received_at) update.received_at = received_at;
    if (notes !== undefined) update.notes = notes;
    const { data, error } = await adminClient.from("purchase_orders").update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}
