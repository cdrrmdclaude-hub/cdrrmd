DROP POLICY IF EXISTS "Requests: self update pending" ON public.requests;
CREATE POLICY "Requests: self update pending" ON public.requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = employee_id AND status = 'pending')
  WITH CHECK (auth.uid() = employee_id AND status = 'pending');

ALTER TABLE public.requests
  ADD CONSTRAINT requests_hours_nonneg_cap CHECK (hours >= 0 AND hours <= 1000),
  ADD CONSTRAINT requests_days_nonneg_cap CHECK (days >= 0 AND days <= 365);