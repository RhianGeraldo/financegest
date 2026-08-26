-- 1. Add company_ids array
ALTER TABLE public.categories ADD COLUMN company_ids UUID[] DEFAULT '{}';
ALTER TABLE public.cost_centers ADD COLUMN company_ids UUID[] DEFAULT '{}';

-- 2. Migrate existing data
UPDATE public.categories SET company_ids = ARRAY[company_id] WHERE company_id IS NOT NULL;
UPDATE public.cost_centers SET company_ids = ARRAY[company_id] WHERE company_id IS NOT NULL;

-- 3. Drop old foreign keys and columns
ALTER TABLE public.categories DROP COLUMN company_id CASCADE;
ALTER TABLE public.cost_centers DROP COLUMN company_id CASCADE;

-- 4. Update RLS for Categories
DROP POLICY IF EXISTS "categories_select" ON public.categories;
CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated
  USING (
    company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) 
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "categories_write" ON public.categories;
CREATE POLICY "categories_write" ON public.categories FOR ALL TO authenticated
  USING (
    (company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
    AND (public.has_role(auth.uid(), 'financeiro') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
    AND (public.has_role(auth.uid(), 'financeiro') OR public.is_super_admin(auth.uid()))
  );

-- 5. Update RLS for Cost Centers
DROP POLICY IF EXISTS "cost_centers_select" ON public.cost_centers;
CREATE POLICY "cost_centers_select" ON public.cost_centers FOR SELECT TO authenticated
  USING (
    company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) 
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "cost_centers_write" ON public.cost_centers;
CREATE POLICY "cost_centers_write" ON public.cost_centers FOR ALL TO authenticated
  USING (
    (company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
    AND (public.has_role(auth.uid(), 'financeiro') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_ids && array(SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
    AND (public.has_role(auth.uid(), 'financeiro') OR public.is_super_admin(auth.uid()))
  );
