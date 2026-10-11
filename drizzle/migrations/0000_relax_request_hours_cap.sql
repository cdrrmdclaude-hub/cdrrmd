ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_hours_range;
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_hours_nonneg_cap;
ALTER TABLE public.requests ADD CONSTRAINT requests_hours_range CHECK (hours >= 0 AND hours <= 2920);