ALTER TABLE public.categories ADD COLUMN cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE CASCADE;
