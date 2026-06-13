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
