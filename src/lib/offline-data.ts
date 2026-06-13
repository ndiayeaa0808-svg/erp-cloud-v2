import { isOnlineSync } from "@/lib/is-online";
import { createClient } from "@/lib/supabase/client";
import { getShopId } from "@/lib/security";
import {
  getCachedProducts, getCachedClients, getCachedSales,
  getCachedExpenses, getCachedCredits, getCachedSaleById,
  cacheProducts, cacheClients, cacheSales, cacheExpenses, cacheCredits,
} from "@/lib/sync/db";

async function loadWithCache<T>(
  table: string,
  fetchFn: () => any,
  cacheFn: (data: T[]) => Promise<void>,
  readCacheFn: () => Promise<T[]>,
): Promise<T[]> {
  if (isOnlineSync()) {
    const res = await fetchFn();
    if (res.data && res.data.length > 0) {
      await cacheFn(res.data);
    }
    return res.data || [];
  }
  return readCacheFn();
}

export async function loadProductsOffline() {
  const supabase = createClient();
  const shopId = await getShopId();
  return loadWithCache(
    "products",
    async () => await supabase.from("products").select("*").is("deleted_at", null).eq("shop_id", shopId).order("name"),
    cacheProducts,
    getCachedProducts,
  );
}

export async function loadClientsOffline() {
  const supabase = createClient();
  const shopId = await getShopId();
  return loadWithCache(
    "clients",
    async () => await supabase.from("clients").select("*").eq("shop_id", shopId).order("name").limit(500),
    cacheClients,
    getCachedClients,
  );
}

export async function loadSalesOffline() {
  const supabase = createClient();
  const shopId = await getShopId();
  return loadWithCache(
    "sales",
    async () => await supabase.from("sales").select("*").is("deleted_at", null).eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200),
    cacheSales,
    getCachedSales,
  );
}

export async function loadExpensesOffline() {
  const supabase = createClient();
  const shopId = await getShopId();
  return loadWithCache(
    "expenses",
    () => supabase.from("expenses").select("*").eq("shop_id", shopId).order("date", { ascending: false }).limit(200),
    cacheExpenses,
    getCachedExpenses,
  );
}

export async function loadCreditsOffline() {
  const supabase = createClient();
  const shopId = await getShopId();
  return loadWithCache(
    "credits",
    () => supabase.from("credits").select("*").eq("shop_id", shopId).limit(200),
    cacheCredits,
    getCachedCredits,
  );
}
