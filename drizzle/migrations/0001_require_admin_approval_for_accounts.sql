ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;

CREATE OR REPLACE FUNCTION public.is_account_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_approved IS TRUE
  )
$$;
REVOKE ALL ON FUNCTION public.is_account_approved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_approved() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_self_approval_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Only an administrator can change account approval';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_approval ON public.profiles;
CREATE TRIGGER profiles_prevent_self_approval
BEFORE UPDATE OF is_approved ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_approval_changes();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_full_name text;
  v_dept text;
  v_pos text;
  v_avatar text;
  v_emp_status text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_dept := COALESCE(NEW.raw_user_meta_data->>'department', '');
  v_pos := COALESCE(NEW.raw_user_meta_data->>'position', '');
  v_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar',
    upper(substr(regexp_replace(coalesce(v_full_name,''), '[^A-Za-z ]','','g'),1,1)));
  v_emp_status := COALESCE(NEW.raw_user_meta_data->>'employment_status', 'Regular');
  IF v_emp_status = 'Service Contract' THEN
    v_emp_status := 'Service Contractual';
  END IF;
  IF v_emp_status NOT IN ('Service Contractual','Job Order','Regular','Casual') THEN
    v_emp_status := 'Regular';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, department, position, avatar, employment_status, is_approved)
  VALUES (NEW.id, NEW.email, v_full_name, v_dept, v_pos, v_avatar, v_emp_status, false);
  INSERT INTO public.leave_balances (user_id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee'::public.app_role);
  RETURN NEW;
END
$$;

DROP POLICY IF EXISTS "Admins can view employment status audit" ON public.employment_status_audit;
CREATE POLICY "Admins can view employment status audit" ON public.employment_status_audit FOR SELECT TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Balances: admin read all" ON public.leave_balances;
CREATE POLICY "Balances: admin read all" ON public.leave_balances FOR SELECT TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Balances: admin write" ON public.leave_balances;
CREATE POLICY "Balances: admin write" ON public.leave_balances FOR ALL TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Balances: self read" ON public.leave_balances;
CREATE POLICY "Balances: self read" ON public.leave_balances FOR SELECT TO authenticated
USING (public.is_account_approved() AND auth.uid() = user_id);

DROP POLICY IF EXISTS "LeaveTypes: admin write" ON public.leave_types;
CREATE POLICY "LeaveTypes: admin write" ON public.leave_types FOR ALL TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "LeaveTypes: read all auth" ON public.leave_types;
CREATE POLICY "LeaveTypes: read all auth" ON public.leave_types FOR SELECT TO authenticated
USING (public.is_account_approved());

DROP POLICY IF EXISTS "Profiles: admin delete" ON public.profiles;
CREATE POLICY "Profiles: admin delete" ON public.profiles FOR DELETE TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Profiles: admin select all" ON public.profiles;
CREATE POLICY "Profiles: admin select all" ON public.profiles FOR SELECT TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Profiles: admin update all" ON public.profiles;
CREATE POLICY "Profiles: admin update all" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Requests: admin delete" ON public.requests;
CREATE POLICY "Requests: admin delete" ON public.requests FOR DELETE TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Requests: admin read all" ON public.requests;
CREATE POLICY "Requests: admin read all" ON public.requests FOR SELECT TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Requests: admin update" ON public.requests;
CREATE POLICY "Requests: admin update" ON public.requests FOR UPDATE TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Requests: self delete pending" ON public.requests;
CREATE POLICY "Requests: self delete pending" ON public.requests FOR DELETE TO authenticated
USING (public.is_account_approved() AND auth.uid() = employee_id AND status = 'pending');
DROP POLICY IF EXISTS "Requests: self insert pending" ON public.requests;
CREATE POLICY "Requests: self insert pending" ON public.requests FOR INSERT TO authenticated
WITH CHECK (public.is_account_approved() AND auth.uid() = employee_id AND status = 'pending');
DROP POLICY IF EXISTS "Requests: self read" ON public.requests;
CREATE POLICY "Requests: self read" ON public.requests FOR SELECT TO authenticated
USING (public.is_account_approved() AND auth.uid() = employee_id);
DROP POLICY IF EXISTS "Requests: self update pending" ON public.requests;
CREATE POLICY "Requests: self update pending" ON public.requests FOR UPDATE TO authenticated
USING (public.is_account_approved() AND auth.uid() = employee_id AND status = 'pending')
WITH CHECK (public.is_account_approved() AND auth.uid() = employee_id AND status = 'pending');

DROP POLICY IF EXISTS "Roles: admin manage" ON public.user_roles;
CREATE POLICY "Roles: admin manage" ON public.user_roles FOR ALL TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Roles: admin read all" ON public.user_roles;
CREATE POLICY "Roles: admin read all" ON public.user_roles FOR SELECT TO authenticated
USING (public.is_account_approved() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Roles: self read" ON public.user_roles;
CREATE POLICY "Roles: self read" ON public.user_roles FOR SELECT TO authenticated
USING (public.is_account_approved() AND auth.uid() = user_id);