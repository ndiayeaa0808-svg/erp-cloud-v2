import Dexie, { type Table } from "dexie";

export interface PendingWrite {
  id?: number;
  table: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  entityId?: string;
  createdAt: string;
  retries: number;
  lastError?: string;
  lastErrorAt?: string;
}

export interface CachedProduct {
  id: string;
  name: string;
  retail: number;
  wholesale: number;
  cost: number;
  stock: number;
  threshold: number;
  unit: string;
  cat: string;
  photo?: string;
  ref?: string;
  barcode?: string;
  supplier?: string;
  desc?: string;
  updatedAt: string;
}

export interface CachedClient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  updatedAt: string;
}

export interface CachedSale {
  id: string;
  shop_id: string;
  invoice_number: string;
  date: string;
  client: string;
  client_phone?: string | null;
  total: number;
  profit: number;
  discount: number;
  payment: string;
  payment_type?: string;
  vendor: string;
  vendor_id: string;
  items: unknown[];
  status: string;
  created_at: string;
  deleted_at?: string | null;
  invoice_deleted_at?: string | null;
  updatedAt: string;
}

export interface CachedExpense {
  id: string;
  shop_id?: string | null;
  desc: string;
  cat?: string | null;
  amount?: number | null;
  date: string;
  note?: string | null;
  receipt_photo?: string | null;
  recurrence?: string | null;
  workflow_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  updatedAt: string;
}

export interface CachedCredit {
  id: string;
  client: string;
  client_phone?: string | null;
  total: number;
  paid: number;
  status: string;
  date: string;
  note?: string | null;
  vendor: string;
  sale_id?: string;
  updatedAt: string;
}

export interface CachedEmployee {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
  salary?: number;
  active: boolean;
  updatedAt: string;
}

export interface CachedCashRegister {
  id: string;
  shop_id: string;
  initial_amount: number;
  current_amount: number;
  actual_amount?: number | null;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  vendor?: string;
  vendor_id?: string;
  note?: string;
  updatedAt: string;
}

export interface SyncMeta {
  id: string;
  lastSyncTime: string;
  processedIds: string[];
}

class LocalDB extends Dexie {
  pendingWrites!: Table<PendingWrite>;
  products!: Table<CachedProduct>;
  clients!: Table<CachedClient>;
  sales!: Table<CachedSale>;
  expenses!: Table<CachedExpense>;
  credits!: Table<CachedCredit>;
  employees!: Table<CachedEmployee>;
  cashRegisters!: Table<CachedCashRegister>;
  syncMeta!: Table<SyncMeta>;

  constructor() {
    super("erp-local");
    this.version(4).stores({
      pendingWrites: "++id, table, action, createdAt, retries",
      products: "id, name, cat, updatedAt",
      clients: "id, name, updatedAt",
      sales: "id, invoice_number, date, client, status, created_at, updatedAt",
      expenses: "id, date, category, updatedAt",
      credits: "id, client, status, date, updatedAt",
      employees: "id, name, role, updatedAt",
      cashRegisters: "id, status, opened_at, updatedAt",
      syncMeta: "id",
    });
    this.version(3).stores({
      pendingWrites: "++id, table, action, createdAt, retries",
      products: "id, name, cat, updatedAt",
      clients: "id, name, updatedAt",
      sales: "id, invoice_number, date, client, status, created_at, updatedAt",
      expenses: "id, date, category, updatedAt",
      credits: "id, client, status, date, updatedAt",
      syncMeta: "id",
    });
    this.version(2).stores({
      pendingWrites: "++id, table, action, createdAt, retries",
      products: "id, name, cat, updatedAt",
      clients: "id, name, updatedAt",
      syncMeta: "id",
    }).upgrade((tx) => {
      tx.table("pendingWrites").toCollection().modify((w) => {
        w.lastError = undefined;
        w.lastErrorAt = undefined;
      });
    });
    this.version(1).stores({
      pendingWrites: "++id, table, action, createdAt",
      products: "id, name, cat, updatedAt",
      clients: "id, name, updatedAt",
    });
  }
}

export const localDB = typeof window !== "undefined" ? new LocalDB() : null;

export async function addPendingWrite(
  table: string,
  action: "create" | "update" | "delete",
  payload: Record<string, unknown>,
  entityId?: string
) {
  if (!localDB) return;
  await localDB.pendingWrites.add({
    table,
    action,
    payload,
    entityId,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
}

export async function getPendingWrites(): Promise<PendingWrite[]> {
  if (!localDB) return [];
  return localDB.pendingWrites.orderBy("createdAt").toArray();
}

export async function removePendingWrite(id: number) {
  if (!localDB) return;
  await localDB.pendingWrites.delete(id);
}

export async function updatePendingWriteRetry(id: number, error: string) {
  if (!localDB) return;
  const existing = await localDB.pendingWrites.get(id);
  if (!existing) return;
  await localDB.pendingWrites.update(id, {
    retries: (existing.retries || 0) + 1,
    lastError: error,
    lastErrorAt: new Date().toISOString(),
  });
}

export async function clearAllPendingWrites() {
  if (!localDB) return;
  await localDB.pendingWrites.clear();
}

export async function cleanupStaleWrites(maxAgeDays = 7) {
  if (!localDB) return;
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  await localDB.pendingWrites.where("createdAt").below(cutoff).delete();
}

export async function cacheProducts(products: CachedProduct[]) {
  if (!localDB) return;
  await localDB.products.bulkPut(products);
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  if (!localDB) return [];
  return localDB.products.toArray();
}

export async function cacheClients(clients: CachedClient[]) {
  if (!localDB) return;
  await localDB.clients.bulkPut(clients);
}

export async function getCachedClients(): Promise<CachedClient[]> {
  if (!localDB) return [];
  return localDB.clients.toArray();
}

export async function cacheSales(sales: CachedSale[]) {
  if (!localDB) return;
  await localDB.sales.bulkPut(sales);
}

export async function getCachedSales(): Promise<CachedSale[]> {
  if (!localDB) return [];
  return localDB.sales.orderBy("created_at").reverse().toArray();
}

export async function cacheExpenses(expenses: CachedExpense[]) {
  if (!localDB) return;
  await localDB.expenses.bulkPut(expenses);
}

export async function getCachedExpenses(): Promise<CachedExpense[]> {
  if (!localDB) return [];
  return localDB.expenses.orderBy("date").reverse().toArray();
}

export async function cacheCredits(credits: CachedCredit[]) {
  if (!localDB) return;
  await localDB.credits.bulkPut(credits);
}

export async function getCachedCredits(): Promise<CachedCredit[]> {
  if (!localDB) return [];
  return localDB.credits.toArray();
}

export async function cacheEmployees(employees: CachedEmployee[]) {
  if (!localDB) return;
  await localDB.employees.bulkPut(employees);
}

export async function getCachedEmployees(): Promise<CachedEmployee[]> {
  if (!localDB) return [];
  return localDB.employees.toArray();
}

export async function cacheCashRegisters(registers: CachedCashRegister[]) {
  if (!localDB) return;
  await localDB.cashRegisters.bulkPut(registers);
}

export async function getCachedCashRegisters(): Promise<CachedCashRegister[]> {
  if (!localDB) return [];
  return localDB.cashRegisters.orderBy("opened_at").reverse().toArray();
}

export async function getCachedSaleById(id: string): Promise<CachedSale | undefined> {
  if (!localDB) return undefined;
  return localDB.sales.get(id);
}

export async function setLastSyncTime() {
  if (!localDB) return;
  const existing = await localDB.syncMeta.get("sync_meta");
  if (existing) {
    await localDB.syncMeta.update("sync_meta", { lastSyncTime: new Date().toISOString() });
  } else {
    await localDB.syncMeta.add({ id: "sync_meta", lastSyncTime: new Date().toISOString(), processedIds: [] });
  }
}

export async function getLastSyncTime(): Promise<string | null> {
  if (!localDB) return null;
  const meta = await localDB.syncMeta.get("sync_meta");
  return meta?.lastSyncTime ?? null;
}

export async function addProcessedId(id: string) {
  if (!localDB) return;
  const existing = await localDB.syncMeta.get("sync_meta");
  if (existing) {
    const ids = existing.processedIds || [];
    ids.push(id);
    if (ids.length > 1000) ids.splice(0, ids.length - 1000);
    await localDB.syncMeta.update("sync_meta", { processedIds: ids });
  } else {
    await localDB.syncMeta.add({ id: "sync_meta", lastSyncTime: new Date().toISOString(), processedIds: [id] });
  }
}

export async function isProcessedId(id: string): Promise<boolean> {
  if (!localDB) return false;
  const meta = await localDB.syncMeta.get("sync_meta");
  return meta?.processedIds?.includes(id) ?? false;
}

export async function updateCachedProduct(id: string, updates: Partial<CachedProduct>) {
  if (!localDB) return;
  await localDB.products.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function updateCachedClient(id: string, updates: Partial<CachedClient>) {
  if (!localDB) return;
  await localDB.clients.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function updateCachedExpense(id: string, updates: Partial<CachedExpense>) {
  if (!localDB) return;
  await localDB.expenses.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function updateCachedCredit(id: string, updates: Partial<CachedCredit>) {
  if (!localDB) return;
  await localDB.credits.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function updateCachedEmployee(id: string, updates: Partial<CachedEmployee>) {
  if (!localDB) return;
  await localDB.employees.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function updateCachedCashRegister(id: string, updates: Partial<CachedCashRegister>) {
  if (!localDB) return;
  await localDB.cashRegisters.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function deleteCachedProduct(id: string) {
  if (!localDB) return;
  await localDB.products.delete(id);
}

export async function deleteCachedClient(id: string) {
  if (!localDB) return;
  await localDB.clients.delete(id);
}

export async function deleteCachedExpense(id: string) {
  if (!localDB) return;
  await localDB.expenses.delete(id);
}

export async function deleteCachedCredit(id: string) {
  if (!localDB) return;
  await localDB.credits.delete(id);
}

export async function deleteCachedEmployee(id: string) {
  if (!localDB) return;
  await localDB.employees.delete(id);
}

export async function deleteCachedCashRegister(id: string) {
  if (!localDB) return;
  await localDB.cashRegisters.delete(id);
}
