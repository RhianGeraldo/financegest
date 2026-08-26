-- ============ OPTIMIZATION INDEXES FOR TRANSACTIONS ============
-- Index for main list query: company_id + due_date DESC
CREATE INDEX IF NOT EXISTS idx_tx_company_due ON public.transactions(company_id, due_date DESC);

-- Index for status filtering (pendente / pago)
CREATE INDEX IF NOT EXISTS idx_tx_company_status ON public.transactions(company_id, status);

-- Index for paid date filtering (cashflow & reports)
CREATE INDEX IF NOT EXISTS idx_tx_company_paid_date ON public.transactions(company_id, paid_date);

-- ============ GIN INDEXES FOR ARRAY COLUMNS (contains / overlaps) ============
-- Categories arrays
CREATE INDEX IF NOT EXISTS idx_categories_company_ids_gin ON public.categories USING GIN (company_ids);
CREATE INDEX IF NOT EXISTS idx_categories_cost_center_ids_gin ON public.categories USING GIN (cost_center_ids);

-- Cost centers arrays
CREATE INDEX IF NOT EXISTS idx_cost_centers_company_ids_gin ON public.cost_centers USING GIN (company_ids);

-- ============ COMPOSITE INDEX FOR SECURITY / RLS ============
-- Speeds up can_access_company() function calls in RLS policies
CREATE INDEX IF NOT EXISTS idx_company_members_composite ON public.company_members(user_id, company_id);
