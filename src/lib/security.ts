import { createClient } from "@/lib/supabase/client";
import { isOnlineSync } from "@/lib/is-online";

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "erp-cloud-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const PIN_CACHE_KEY = "cached_pin_hash";

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  if (isOnlineSync()) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("pin")
        .eq("id", userId)
        .single();
      if (data?.pin) {
        const hashed = data.pin.length === 4 && !isNaN(Number(data.pin))
          ? pin
          : await hashPin(pin);
        const valid = data.pin === hashed;
        if (valid && typeof localStorage !== "undefined") {
          localStorage.setItem(PIN_CACHE_KEY, data.pin);
        }
        return valid;
      }
    } catch {}
  }
  // Fallback offline : vérifier contre le PIN caché
  const cached = typeof localStorage !== "undefined" ? localStorage.getItem(PIN_CACHE_KEY) : null;
  if (!cached) return false;
  const pinToCheck = cached.length === 4 && !isNaN(Number(cached)) ? pin : await hashPin(pin);
  return cached === pinToCheck;
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
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem("shop_id") : null;
    if (cached) return cached;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return cached;
      const { data: u } = await supabase.from("users").select("shop_id").eq("id", user.id).single();
      if (u?.shop_id) {
        if (typeof localStorage !== "undefined") localStorage.setItem("shop_id", u.shop_id);
        return u.shop_id;
      }
    } catch {}
    return cached;
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

export async function updatePin(userId: string, newPin: string): Promise<boolean> {
  const supabase = createClient();
  const hashed = await hashPin(newPin);
  const { error } = await supabase.from("users").update({ pin: hashed }).eq("id", userId);
  if (!error && typeof localStorage !== "undefined") {
    localStorage.setItem(PIN_CACHE_KEY, hashed);
  }
  return !error;
}
