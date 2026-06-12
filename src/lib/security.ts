import { createClient } from "@/lib/supabase/client";

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("users")
    .select("pin")
    .eq("id", userId)
    .single();
  return data?.pin === pin;
}

export async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  return appUser;
}

export async function getShopId(): Promise<string | null> {
  const supabase = createClient();
  try {
    // Toujours donner la priorité à la session Supabase (user_metadata)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.user_metadata?.shop_id) {
      const sid = session.user.user_metadata.shop_id as string;
      if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", sid);
      return sid;
    }
    // Fallback : requête directe à la table users
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const cached = typeof localStorage !== "undefined" ? localStorage.getItem("shop_id") : null;
      return cached;
    }
    const { data: u, error: userErr } = await supabase.from("users").select("shop_id").eq("id", user.id).single();
    if (!userErr && u?.shop_id) {
      if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", u.shop_id);
      return u.shop_id;
    }
    // Fallback au cache local si la requête RLS échoue
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem("shop_id") : null;
    if (cached) return cached;
    return null;
  } catch {
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem("shop_id") : null;
    return cached;
  }
}

export async function logAudit(params: {
  action: string;
  entity: string;
  entity_id?: string;
  data?: Record<string, unknown>;
}) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const shopId = await getShopId();
    await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop_id: shopId,
        user_id: user.id,
        action: params.action,
        entity: params.entity,
        entity_id: params.entity_id,
        data: params.data,
      }),
    });
  } catch {}
}

export async function requirePinAction(
  userId: string,
  pin: string,
  action: string,
  entity: string,
  entityId?: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const valid = await verifyPin(userId, pin);
  if (valid) {
    try { await logAudit({ action, entity, entity_id: entityId, data }); } catch {}
  }
  return valid;
}

export async function getShopInfo() {
  const supabase = createClient();
  const shopId = await getShopId();
  if (!shopId) return null;
  const { data } = await supabase.from("shops").select("*").eq("id", shopId).single();
  return data;
}
