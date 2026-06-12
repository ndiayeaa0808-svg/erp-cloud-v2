import { createClient } from "@/lib/supabase/client";

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    });
    if (!res.ok) return false;
    const { valid } = await res.json();
    return valid === true;
  } catch {
    return false;
  }
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
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.user_metadata?.shop_id) {
      const sid = session.user.user_metadata.shop_id as string;
      if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", sid);
      return sid;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const cached = typeof localStorage !== "undefined" ? localStorage.getItem("shop_id") : null;
      return cached;
    }
    const fromMeta = user.user_metadata?.shop_id || user.app_metadata?.shop_id;
    if (fromMeta) {
      if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", fromMeta);
      return fromMeta;
    }
    const { data: u, error: userErr } = await supabase.from("users").select("shop_id").eq("id", user.id).single();
    if (!userErr && u?.shop_id) {
      if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", u.shop_id);
      return u.shop_id;
    }
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
