export interface Shop {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
  default_stock_threshold?: number;
  logo?: string;
  ninea?: string;
  rccm?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  cat?: string;
  ref?: string;
  barcode?: string;
  cost?: number;
  retail?: number;
  wholesale?: number;
  stock?: number;
  threshold?: number;
  unit?: string;
  supplier?: string;
  photo?: string;
  desc?: string;
  lot_number?: string;
  serial_number?: string;
  variant?: string;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Sale {
  id: string;
  shop_id: string;
  invoice_number?: string;
  date: string;
  client?: string;
  client_phone?: string | null;
  client_id?: string | null;
  type?: string;
  payment?: string;
  payment_type?: string;
  total?: number;
  profit?: number;
  discount?: number;
  delivery_type?: string;
  delivery_cost?: number;
  status?: string;
  items?: SaleItem[];
  vendor?: string;
  vendor_id?: string | null;
  note?: string;
  deleted_at?: string | null;
  invoice_deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  shop_id: string;
  product_id?: string | null;
  product_name?: string;
  qty?: number;
  price?: number;
  cost?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  shop_id: string;
  desc: string;
  cat?: string;
  amount?: number;
  date: string;
  note?: string;
  receipt_photo?: string;
  recurrence?: string;
  workflow_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Credit {
  id: string;
  shop_id: string;
  client: string;
  client_phone?: string | null;
  client_id?: string | null;
  total?: number;
  paid?: number;
  payments?: CreditPayment[];
  items?: { product_id: string; product_name: string; qty: number; price: number; total: number }[];
  date?: string;
  due?: string;
  status?: string;
  reminder_at?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreditPayment {
  amount: number;
  date: string;
  method?: string;
  note?: string;
}

export interface Client {
  id: string;
  shop_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  type?: string;
  notes?: string;
  favorite_products?: string[];
  total_spent?: number;
  loyalty_points?: number;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  shop_id: string;
  name: string;
  login: string;
  email?: string;
  role?: string;
  perms?: Record<string, boolean>;
  status?: string;
  is_blocked?: boolean;
  auth_provider?: string;
  pin?: string;
  last_login_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityLog {
  id: string;
  shop_id: string;
  ts?: number;
  user?: string;
  action: string;
  detail?: string;
  created_at?: string;
}

export interface Setting {
  key: string;
  shop_id: string;
  value?: Record<string, unknown>;
  updated_at?: string;
}

export interface Employee {
  id: string;
  shop_id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  salary?: number;
  status?: string;
  hire_date?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CashMovement {
  id: string;
  shop_id: string;
  type?: string;
  category?: string;
  amount?: number;
  note?: string;
  payment_method?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  shop_id: string;
  user_id?: string | null;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  read?: boolean;
  created_at?: string;
}

export interface CashRegister {
  id: string;
  shop_id: string;
  user_id: string;
  user_name?: string;
  opened_at: string;
  closed_at?: string | null;
  initial_amount: number;
  expected_amount?: number;
  actual_amount?: number;
  difference?: number;
  total_sales?: number;
  total_cash?: number;
  total_mobile?: number;
  total_other?: number;
  status: 'open' | 'closed';
  note?: string;
  device?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: string;
  shop_id: string;
  sale_id: string;
  invoice_number: string;
  type: 'thermal_50mm' | 'a5' | 'a4';
  client?: string;
  client_address?: string;
  items: InvoiceItem[];
  total: number;
  payment_method?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceItem {
  product_name: string;
  qty: number;
  price: number;
  total: number;
}

export interface AuditLog {
  id: string;
  shop_id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity: string;
  entity_id?: string;
  data?: Record<string, unknown>;
  created_at?: string;
}

export interface DeletedRecord {
  id: string;
  table_name: string;
  record_id: string;
  shop_id: string;
  data?: Record<string, unknown>;
  deleted_at?: string;
  deleted_by?: string;
}

export interface AccountingEntry {
  id: string;
  shop_id: string;
  cash_register_id?: string;
  type: 'sale' | 'expense' | 'payment_in' | 'payment_out';
  category?: string;
  amount: number;
  payment_method?: string;
  reference?: string;
  description?: string;
  entry_date: string;
  created_by?: string;
  created_at?: string;
}

export interface Supplier {
  id: string;
  shop_id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  debt?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StockMovement {
  id: string;
  shop_id: string;
  product_id: string;
  product_name?: string;
  type: "in" | "out" | "adjustment";
  qty: number;
  before?: number;
  after?: number;
  reason?: string;
  user_id?: string;
  user_name?: string;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  shop_id: string;
  supplier_id?: string;
  supplier_name?: string;
  reference?: string;
  status: "pending" | "ordered" | "partial" | "received" | "cancelled";
  items?: PurchaseOrderItem[];
  total?: number;
  tax?: number;
  discount?: number;
  notes?: string;
  ordered_at?: string;
  received_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrderItem {
  id?: string;
  order_id?: string;
  product_id?: string;
  product_name: string;
  qty: number;
  received_qty?: number;
  unit_cost: number;
  total: number;
}

export interface License {
  id: string;
  code: string;
  plan: string;
  status: string;
  used_by_email?: string;
  notes?: string;
  created_at?: string;
  expires_at?: string;
}

export interface ShopWithLicense extends Shop {
  license_status?: string;
  licenses?: License;
}

export interface TableMeta<T> {
  data: T[];
  count: number;
  error?: string;
}
