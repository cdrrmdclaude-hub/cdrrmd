
-- Cap hours/days to sane ranges
ALTER TABLE public.requests
  ADD CONSTRAINT requests_hours_range CHECK (hours >= 0 AND hours <= 24),
  ADD CONSTRAINT requests_days_range  CHECK (days  >= 0 AND days  <= 365);

-- Re-assert self-update policy: employees may only keep status='pending'
DROP POLICY IF EXISTS "Requests: self update pending" ON public.requests;
CREATE POLICY "Requests: self update pending"
ON public.requests
FOR UPDATE
TO authenticated
USING (auth.uid() = employee_id AND status = 'pending')
WITH CHECK (auth.uid() = employee_id AND status = 'pending');
