
CREATE TABLE public.employment_status_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  changed_by UUID,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.employment_status_audit TO authenticated;
GRANT ALL ON public.employment_status_audit TO service_role;

ALTER TABLE public.employment_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view employment status audit"
  ON public.employment_status_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX employment_status_audit_employee_idx
  ON public.employment_status_audit(employee_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_employment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
    INSERT INTO public.employment_status_audit (employee_id, changed_by, old_status, new_status)
    VALUES (NEW.id, auth.uid(), OLD.employment_status, NEW.employment_status);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_employment_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_employment_status_change ON public.profiles;
CREATE TRIGGER trg_log_employment_status_change
  AFTER UPDATE OF employment_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_employment_status_change();
