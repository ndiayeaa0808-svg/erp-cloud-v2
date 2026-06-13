-- ERP Cloud - Schema Complet avec nouvelles tables pour l'amélioration

-- ============================================================
-- TABLES EXISTANTES (inchangées)
-- ============================================================

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT DEFAULT 'FCFA',
  default_stock_threshold INT DEFAULT 10,
  logo TEXT,
  ninea TEXT,
  rccm TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cat TEXT DEFAULT 'Général',
  ref TEXT,
  barcode TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  retail NUMERIC(12,2) DEFAULT 0,
  wholesale NUMERIC(12,2) DEFAULT 0,
  stock NUMERIC(12,2) DEFAULT 0,
  threshold NUMERIC(12,2) DEFAULT 10,
  unit TEXT DEFAULT 'pcs',
  supplier TEXT,
  photo TEXT,
  desc TEXT,
  lot_number TEXT,
  serial_number TEXT,
  variant TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  invoice_number TEXT,
  date DATE DEFAULT CURRENT_DATE,
  client TEXT,
  client_id UUID REFERENCES clients(id),
  type TEXT DEFAULT 'detail',
  payment TEXT DEFAULT 'especes',
  total NUMERIC(12,2) DEFAULT 0,
  profit NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  delivery_type TEXT,
  delivery_cost NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'completed',
  items JSONB DEFAULT '[]',
  vendor TEXT,
  vendor_id UUID REFERENCES users(id),
  note TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  qty NUMERIC(12,2) DEFAULT 1,
  price NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  desc TEXT NOT NULL,
  cat TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  note TEXT,
  receipt_photo TEXT,
  recurrence TEXT,
  workflow_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  total NUMERIC(12,2) DEFAULT 0,
  paid NUMERIC(12,2) DEFAULT 0,
  payments JSONB DEFAULT '[]',
  date DATE DEFAULT CURRENT_DATE,
  due DATE,
  status TEXT DEFAULT 'open',
  reminder_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  type TEXT,
  notes TEXT,
  favorite_products JSONB DEFAULT '[]',
  total_spent NUMERIC(12,2) DEFAULT 0,
  loyalty_points INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  login TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'caissier',
  perms JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  is_blocked BOOLEAN DEFAULT false,
  auth_provider TEXT,
  pin TEXT DEFAULT '0000',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(login, shop_id)
);

CREATE TABLE activityLog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  ts BIGINT,
  user TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE settings (
  key TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, shop_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  title TEXT,
  body TEXT,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  type TEXT,
  category TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  salary NUMERIC(12,2),
  status TEXT DEFAULT 'active',
  hire_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- NOUVELLES TABLES
-- ============================================================

-- Gestion de caisse (ouverture/fermeture par vendeur)
CREATE TABLE cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  initial_amount NUMERIC(12,2) DEFAULT 0,
  expected_amount NUMERIC(12,2) DEFAULT 0,
  actual_amount NUMERIC(12,2),
  difference NUMERIC(12,2),
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_cash NUMERIC(12,2) DEFAULT 0,
  total_mobile NUMERIC(12,2) DEFAULT 0,
  total_other NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  note TEXT,
  device TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Journal d'audit (remplace activityLog pour la traçabilité)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Corbeille (enregistrements supprimés)
CREATE TABLE deleted_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}',
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ DEFAULT now()
);

-- Comptabilité de caisse (journal des mouvements financiers)
CREATE TABLE accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  cash_register_id UUID REFERENCES cash_registers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'expense', 'payment_in', 'payment_out')),
  category TEXT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT,
  reference TEXT,
  description TEXT,
  entry_date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_cash_registers_shop_id ON cash_registers(shop_id);
CREATE INDEX idx_cash_registers_user_id ON cash_registers(user_id);
CREATE INDEX idx_cash_registers_status ON cash_registers(status);
CREATE INDEX idx_cash_registers_opened_at ON cash_registers(opened_at);
CREATE INDEX idx_audit_logs_shop_id ON audit_logs(shop_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_deleted_records_shop_id ON deleted_records(shop_id);
CREATE INDEX idx_deleted_records_table_name ON deleted_records(table_name);
CREATE INDEX idx_accounting_entries_shop_id ON accounting_entries(shop_id);
CREATE INDEX idx_accounting_entries_date ON accounting_entries(entry_date);
CREATE INDEX idx_accounting_entries_type ON accounting_entries(type);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shop cash registers" ON cash_registers
  FOR ALL USING (
    shop_id = (SELECT raw_user_meta_data->>'shop_id' FROM auth.users WHERE id = auth.uid())
    OR shop_id = (SELECT shop_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can view own shop audit logs" ON audit_logs
  FOR ALL USING (
    shop_id = (SELECT raw_user_meta_data->>'shop_id' FROM auth.users WHERE id = auth.uid())
    OR shop_id = (SELECT shop_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can view own shop deleted records" ON deleted_records
  FOR ALL USING (
    shop_id = (SELECT raw_user_meta_data->>'shop_id' FROM auth.users WHERE id = auth.uid())
    OR shop_id = (SELECT shop_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can view own shop accounting" ON accounting_entries
  FOR ALL USING (
    shop_id = (SELECT raw_user_meta_data->>'shop_id' FROM auth.users WHERE id = auth.uid())
    OR shop_id = (SELECT shop_id FROM users WHERE id = auth.uid())
  );

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE cash_registers;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE accounting_entries;

-- ============================================================
-- GESTION DES LICENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'monthly', 'quarterly', 'semi_annual', 'lifetime')),
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  installation_fee_paid BOOLEAN DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  used_by_email TEXT,
  notes TEXT
);

ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'inactive' CHECK (license_status IN ('inactive', 'trial', 'active', 'expired', 'cancelled'));
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.licenses FOR ALL USING (true);
