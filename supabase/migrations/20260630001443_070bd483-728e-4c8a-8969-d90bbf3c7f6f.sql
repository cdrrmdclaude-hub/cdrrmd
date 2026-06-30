
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'Regular';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employment_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_employment_status_check
  CHECK (employment_status IN ('Service Contract','Job Order','Regular','Casual'));

-- Update new-user handler to capture employment_status from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text;
  v_dept text;
  v_pos text;
  v_avatar text;
  v_emp_status text;
  v_is_first boolean;
  v_role public.app_role;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_dept := COALESCE(NEW.raw_user_meta_data->>'department', '');
  v_pos := COALESCE(NEW.raw_user_meta_data->>'position', '');
  v_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar',
    upper(substr(regexp_replace(coalesce(v_full_name,''), '[^A-Za-z ]','','g'),1,1)));
  v_emp_status := COALESCE(NEW.raw_user_meta_data->>'employment_status', 'Regular');
  IF v_emp_status NOT IN ('Service Contract','Job Order','Regular','Casual') THEN
    v_emp_status := 'Regular';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, department, position, avatar, employment_status)
  VALUES (NEW.id, NEW.email, v_full_name, v_dept, v_pos, v_avatar, v_emp_status);

  INSERT INTO public.leave_balances (user_id) VALUES (NEW.id);

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);

  RETURN NEW;
END $function$;

-- Server-side guard: only Regular / Casual employees can file a leave request
CREATE OR REPLACE FUNCTION public.enforce_leave_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_status text;
BEGIN
  IF NEW.type = 'leave' THEN
    SELECT employment_status INTO emp_status
      FROM public.profiles WHERE id = NEW.employee_id;
    IF emp_status IS NULL OR emp_status NOT IN ('Regular','Casual') THEN
      RAISE EXCEPTION 'Only Regular and Casual employees may file leave requests (employment_status=%).', emp_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_leave_eligibility ON public.requests;
CREATE TRIGGER trg_enforce_leave_eligibility
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_eligibility();
