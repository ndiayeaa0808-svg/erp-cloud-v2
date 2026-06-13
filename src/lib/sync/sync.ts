import { createClient } from "@/lib/supabase/client";
import {
  getPendingWrites, removePendingWrite, updatePendingWriteRetry,
  cacheProducts, cacheClients, cacheSales, cacheExpenses, cacheCredits,
  cacheEmployees, cacheCashRegisters,
  addPendingWrite,
  setLastSyncTime, getLastSyncTime, cleanupStaleWrites, clearAllPendingWrites,
  addProcessedId, isProcessedId,
} from "./db";
import { getShopId } from "@/lib/security";
import { toast } from "sonner";

export type SyncStatus = "idle" | "syncing" | "pending" | "error";
type StatusCallback = (status: SyncStatus, count?: number, lastSyncTime?: string | null) => void;

let statusListeners: StatusCallback[] = [];
let currentStatus: SyncStatus = "idle";
let pendingCount = 0;
let currentLastSyncTime: string | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function onSyncStatus(cb: StatusCallback) {
  statusListeners.push(cb);
  cb(currentStatus, pendingCount, currentLastSyncTime);
  return () => { statusListeners = statusListeners.filter((l) => l !== cb); };
}

function setStatus(status: SyncStatus, count?: number, lastSyncTime?: string | null) {
  currentStatus = status;
  pendingCount = count ?? 0;
  if (lastSyncTime !== undefined) currentLastSyncTime = lastSyncTime;
  statusListeners.forEach((l) => l(status, pendingCount, currentLastSyncTime));
}

const MAX_RETRIES = 5;
const BATCH_SIZE = 10;

function getBackoffDelay(retries: number): number {
  return Math.min(1000 * Math.pow(2, retries), 60000);
}

export async function processSyncQueue() {
  const supabase = createClient();
  const writes = await getPendingWrites();
  if (writes.length === 0) {
    const lastSync = await getLastSyncTime();
    setStatus("idle", 0, lastSync);
    return;
  }

  setStatus("syncing", writes.length);

  const batch = writes.slice(0, BATCH_SIZE);
  let successCount = 0;
  let failCount = 0;

  for (const write of batch) {
    try {
      const shopId = await getShopId();
      const payload = { ...write.payload };
      if (!payload.shop_id && shopId) payload.shop_id = shopId;
      delete payload.synced_from_offline;
      delete payload.updatedAt;

      if (write.table === "sales" && write.action === "create") {
        if (write.entityId) {
          const already = await isProcessedId(write.entityId);
          if (already) {
            await removePendingWrite(write.id!);
            successCount++;
            continue;
          }
        }
        const { error } = await supabase.from("sales").insert(payload);
        if (error) {
          if (error.code === "23505") {
            await removePendingWrite(write.id!);
            if (write.entityId) await addProcessedId(write.entityId);
            successCount++;
            continue;
          }
          throw error;
        }
        if (write.entityId) await addProcessedId(write.entityId);
        if (payload.items && Array.isArray(payload.items)) {
          for (const item of payload.items) {
            if (item.product_id && item.qty) {
              const { data: prod } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
              if (prod) {
                await supabase.from("products").update({ stock: Math.max(0, (prod.stock || 0) - item.qty) }).eq("id", item.product_id);
              }
            }
          }
        }
      } else if (write.table === "sales" && write.action === "delete") {
        const { error } = await supabase.from("sales").update({ deleted_at: new Date().toISOString() }).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "sales" && write.action === "update") {
        const { error } = await supabase.from("sales").update(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "credits" && write.action === "create") {
        const { error } = await supabase.from("credits").insert(payload);
        if (error && error.code === "PGRST204") {
          const fallback = { ...payload };
          delete fallback.sale_id;
          const { error: e2 } = await supabase.from("credits").insert(fallback);
          if (e2) throw e2;
        } else if (error) {
          if (error.code === "23505") {
            await removePendingWrite(write.id!);
            successCount++;
            continue;
          }
          throw error;
        }
      } else if (write.table === "credits" && write.action === "update") {
        const { error } = await supabase.from("credits").update(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "credits" && write.action === "delete") {
        const { error } = await supabase.from("credits").delete().eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "products" && (write.action === "create" || write.action === "update")) {
        const { error } = await supabase.from("products").upsert(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "products" && write.action === "delete") {
        const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "stock" && write.action === "update") {
        const { error } = await supabase.from("products").update({ stock: payload.stock }).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "clients" && (write.action === "create" || write.action === "update")) {
        const { error } = await supabase.from("clients").upsert(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "clients" && write.action === "delete") {
        const { error } = await supabase.from("clients").delete().eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "expenses" && (write.action === "create" || write.action === "update")) {
        const { error } = await supabase.from("expenses").upsert(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "expenses" && write.action === "delete") {
        const { error } = await supabase.from("expenses").delete().eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "employees" && (write.action === "create" || write.action === "update")) {
        const { error } = await supabase.from("employees").upsert(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "employees" && write.action === "delete") {
        const { error } = await supabase.from("employees").delete().eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "cash_registers" && (write.action === "create" || write.action === "update")) {
        const { error } = await supabase.from("cash_registers").upsert(payload).eq("id", write.entityId!);
        if (error) throw error;
      } else if (write.table === "cash_registers" && write.action === "delete") {
        const { error } = await supabase.from("cash_registers").delete().eq("id", write.entityId!);
        if (error) throw error;
      }

      await removePendingWrite(write.id!);
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      console.error(`Sync failed for write #${write.id} (${write.table}/${write.action}):`, message);
      failCount++;

      if ((write.retries ?? 0) >= MAX_RETRIES) {
        await removePendingWrite(write.id!);
        toast.error(`Échec sync définitif`, {
          description: `${write.table} #${write.id}: ${message}`,
          duration: 5000,
        });
      } else {
        await updatePendingWriteRetry(write.id!, message);
      }
    }
  }

  if (successCount > 0) {
    await setLastSyncTime();
    toast.success(`${successCount} écriture(s) synchronisée(s)`, {
      description: failCount > 0 ? `${failCount} échec(s)` : undefined,
      duration: 3000,
    });
    refreshCache();
  }

  const remaining = await getPendingWrites();
  const lastSync = await getLastSyncTime();
  setStatus(remaining.length > 0 ? "error" : "idle", remaining.length, lastSync);

  if (remaining.length > 0 && remaining.length !== writes.length) {
    setTimeout(processSyncQueue, 2000);
  }
}

export async function tryRetryPendingWrite(id: number) {
  const supabase = createClient();
  const writes = await getPendingWrites();
  const write = writes.find((w) => w.id === id);
  if (!write) return;

  try {
    const shopId = await getShopId();
    const payload = { ...write.payload };
    if (!payload.shop_id && shopId) payload.shop_id = shopId;
    delete payload.synced_from_offline;
    delete payload.updatedAt;

    if (write.table === "sales" && write.action === "create") {
      const { error } = await supabase.from("sales").insert(payload);
      if (error && error.code !== "23505") throw error;
    } else if (write.table === "credits" && write.action === "create") {
      const { error } = await supabase.from("credits").insert(payload);
      if (error && error.code === "PGRST204") {
        const fallback = { ...payload };
        delete fallback.sale_id;
        const { error: e2 } = await supabase.from("credits").insert(fallback);
        if (e2) throw e2;
      } else if (error && error.code !== "23505") throw error;
    }

    await removePendingWrite(write.id!);
    await setLastSyncTime();
    toast.success("Écriture rejouée avec succès");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    toast.error("Échec de la relecture", { description: message });
  }

  const remaining = await getPendingWrites();
  const lastSync = await getLastSyncTime();
  setStatus(remaining.length > 0 ? "error" : "idle", remaining.length, lastSync);
}

export function startSyncListener() {
  const onOnline = async () => {
    await processSyncQueue();
    refreshCache();
  };
  window.addEventListener("online", onOnline);
  cleanupStaleWrites();
  processSyncQueue();
  syncInterval = setInterval(processSyncQueue, 30000);
  return () => {
    window.removeEventListener("online", onOnline);
    if (syncInterval) clearInterval(syncInterval);
  };
}

export function stopSyncListener() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function checkPendingWrites() {
  const writes = await getPendingWrites();
  const lastSync = await getLastSyncTime();
  await cleanupStaleWrites();
  setStatus(writes.length > 0 ? "pending" : "idle", writes.length, lastSync);
  return writes.length;
}

export async function createSaleOffline(salePayload: Record<string, unknown>) {
  const entityId = (salePayload.id as string) || crypto.randomUUID();
  await addPendingWrite("sales", "create", salePayload, entityId);
  await checkPendingWrites();
}

export async function updateSaleOffline(saleId: string, payload: Record<string, unknown>) {
  await addPendingWrite("sales", "update", payload, saleId);
  await checkPendingWrites();
}

export async function deleteSaleOffline(saleId: string) {
  await addPendingWrite("sales", "delete", {}, saleId);
  await checkPendingWrites();
}

export async function createCreditOffline(creditPayload: Record<string, unknown>) {
  await addPendingWrite("credits", "create", creditPayload);
  await checkPendingWrites();
}

export async function updateCreditOffline(creditId: string, payload: Record<string, unknown>) {
  await addPendingWrite("credits", "update", payload, creditId);
  await checkPendingWrites();
}

export async function deleteCreditOffline(creditId: string) {
  await addPendingWrite("credits", "delete", {}, creditId);
  await checkPendingWrites();
}

export async function createProductOffline(productPayload: Record<string, unknown>) {
  const entityId = (productPayload.id as string) || crypto.randomUUID();
  await addPendingWrite("products", "create", productPayload, entityId);
  await checkPendingWrites();
}

export async function updateProductOffline(productId: string, payload: Record<string, unknown>) {
  await addPendingWrite("products", "update", payload, productId);
  await checkPendingWrites();
}

export async function deleteProductOffline(productId: string) {
  await addPendingWrite("products", "delete", {}, productId);
  await checkPendingWrites();
}

export async function updateStockOffline(productId: string, stock: number) {
  await addPendingWrite("stock", "update", { stock }, productId);
  await checkPendingWrites();
}

export async function createClientOffline(clientPayload: Record<string, unknown>) {
  const entityId = (clientPayload.id as string) || crypto.randomUUID();
  await addPendingWrite("clients", "create", clientPayload, entityId);
  await checkPendingWrites();
}

export async function updateClientOffline(clientId: string, payload: Record<string, unknown>) {
  await addPendingWrite("clients", "update", payload, clientId);
  await checkPendingWrites();
}

export async function deleteClientOffline(clientId: string) {
  await addPendingWrite("clients", "delete", {}, clientId);
  await checkPendingWrites();
}

export async function createExpenseOffline(expensePayload: Record<string, unknown>) {
  const entityId = (expensePayload.id as string) || crypto.randomUUID();
  await addPendingWrite("expenses", "create", expensePayload, entityId);
  await checkPendingWrites();
}

export async function updateExpenseOffline(expenseId: string, payload: Record<string, unknown>) {
  await addPendingWrite("expenses", "update", payload, expenseId);
  await checkPendingWrites();
}

export async function deleteExpenseOffline(expenseId: string) {
  await addPendingWrite("expenses", "delete", {}, expenseId);
  await checkPendingWrites();
}

export async function createEmployeeOffline(employeePayload: Record<string, unknown>) {
  const entityId = (employeePayload.id as string) || crypto.randomUUID();
  await addPendingWrite("employees", "create", employeePayload, entityId);
  await checkPendingWrites();
}

export async function updateEmployeeOffline(employeeId: string, payload: Record<string, unknown>) {
  await addPendingWrite("employees", "update", payload, employeeId);
  await checkPendingWrites();
}

export async function deleteEmployeeOffline(employeeId: string) {
  await addPendingWrite("employees", "delete", {}, employeeId);
  await checkPendingWrites();
}

export async function createCashRegisterOffline(registerPayload: Record<string, unknown>) {
  const entityId = (registerPayload.id as string) || crypto.randomUUID();
  await addPendingWrite("cash_registers", "create", registerPayload, entityId);
  await checkPendingWrites();
}

export async function updateCashRegisterOffline(registerId: string, payload: Record<string, unknown>) {
  await addPendingWrite("cash_registers", "update", payload, registerId);
  await checkPendingWrites();
}

export async function refreshCache() {
  try {
    const supabase = createClient();
    const shopId = await getShopId();
    if (!shopId) return;

    const allResults = await Promise.allSettled([
      supabase.from("products").select("id,name,retail,wholesale,cost,stock,threshold,unit,cat,photo,ref,barcode,supplier,desc").is("deleted_at", null).eq("shop_id", shopId),
      supabase.from("clients").select("id,name,phone,email,address").eq("shop_id", shopId).limit(500),
      supabase.from("sales").select("*").is("deleted_at", null).eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200),
      supabase.from("expenses").select("*").eq("shop_id", shopId).order("date", { ascending: false }).limit(200),
      supabase.from("credits").select("*").eq("shop_id", shopId).limit(200),
      supabase.from("employees").select("*").eq("shop_id", shopId),
      supabase.from("cash_registers").select("*").eq("shop_id", shopId).order("opened_at", { ascending: false }).limit(100),
    ]);
    const [prodRes, clientRes, salesRes, expensesRes, creditsRes, empRes, regRes] = allResults.map((r) => r.status === "fulfilled" ? r.value : { data: null, error: r.reason });

    const now = new Date().toISOString();

    if (prodRes.data) {
      await cacheProducts(prodRes.data.map((p) => ({ ...p, updatedAt: now })));
    }
    if (clientRes.data) {
      await cacheClients(clientRes.data.map((c) => ({ ...c, updatedAt: now })));
    }
    if (salesRes.data) {
      await cacheSales(salesRes.data.map((s) => ({ ...s, updatedAt: now })));
    }
    if (expensesRes.data) {
      await cacheExpenses(expensesRes.data.map((e) => ({ ...e, updatedAt: now })));
    }
    if (creditsRes.data) {
      await cacheCredits(creditsRes.data.map((c) => ({ ...c, updatedAt: now })));
    }
    if (empRes.data) {
      await cacheEmployees(empRes.data.map((e) => ({ ...e, updatedAt: now })));
    }
    if (regRes.data) {
      await cacheCashRegisters(regRes.data.map((r) => ({ ...r, updatedAt: now })));
    }
  } catch (e) {
    console.error("refreshCache error:", e);
  }
}
