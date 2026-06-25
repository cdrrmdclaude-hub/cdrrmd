
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin','employee');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  avatar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Profiles: self select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: admin select all" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profiles: self update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: admin update all" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profiles: admin delete" ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles policies
CREATE POLICY "Roles: self read" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Roles: admin read all" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Roles: admin manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Leave types
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  default_days integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LeaveTypes: read all auth" ON public.leave_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LeaveTypes: admin write" ON public.leave_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Leave balances (one row per user)
CREATE TABLE public.leave_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_overtime numeric NOT NULL DEFAULT 0,
  credits_duty_off numeric NOT NULL DEFAULT 0,
  offset_used numeric NOT NULL DEFAULT 0,
  leave_balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Balances: self read" ON public.leave_balances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Balances: admin read all" ON public.leave_balances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Balances: admin write" ON public.leave_balances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Requests
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,                   -- 'overtime' | 'duty_off' | 'offset' | 'leave'
  leave_type_id uuid REFERENCES public.leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time text,
  end_time text,
  hours numeric NOT NULL DEFAULT 0,
  days numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requests: self read" ON public.requests
  FOR SELECT TO authenticated USING (auth.uid() = employee_id);
CREATE POLICY "Requests: admin read all" ON public.requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Requests: self insert" ON public.requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = employee_id AND status = 'pending');
CREATE POLICY "Requests: self update pending" ON public.requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = employee_id AND status = 'pending')
  WITH CHECK (auth.uid() = employee_id);
CREATE POLICY "Requests: admin update" ON public.requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Requests: self delete pending" ON public.requests
  FOR DELETE TO authenticated USING (auth.uid() = employee_id AND status = 'pending');
CREATE POLICY "Requests: admin delete" ON public.requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_balances_touch BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile, balance, role on signup. First user becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
  v_dept text;
  v_pos text;
  v_avatar text;
  v_is_first boolean;
  v_role public.app_role;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_dept := COALESCE(NEW.raw_user_meta_data->>'department', '');
  v_pos := COALESCE(NEW.raw_user_meta_data->>'position', '');
  v_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar',
    upper(substr(regexp_replace(coalesce(v_full_name,''), '[^A-Za-z ]','','g'),1,1)));

  INSERT INTO public.profiles (id, email, full_name, department, position, avatar)
  VALUES (NEW.id, NEW.email, v_full_name, v_dept, v_pos, v_avatar);

  INSERT INTO public.leave_balances (user_id) VALUES (NEW.id);

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_is_first;
  v_role := CASE WHEN v_is_first THEN 'admin'::public.app_role ELSE 'employee'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Approve/reject RPC: atomic status update + balance adjustment for offset/leave requests
CREATE OR REPLACE FUNCTION public.decide_request(
  _request_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
) RETURNS public.requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.requests;
  bal public.leave_balances;
  lt_code text;
  cur_balance numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'already decided'; END IF;

  IF _approve THEN
    -- ensure balance row exists
    INSERT INTO public.leave_balances (user_id) VALUES (r.employee_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bal FROM public.leave_balances WHERE user_id = r.employee_id FOR UPDATE;

    IF r.type = 'overtime' THEN
      UPDATE public.leave_balances
        SET credits_overtime = credits_overtime + r.hours
        WHERE user_id = r.employee_id;
    ELSIF r.type = 'duty_off' THEN
      UPDATE public.leave_balances
        SET credits_duty_off = credits_duty_off + r.hours
        WHERE user_id = r.employee_id;
    ELSIF r.type = 'offset' THEN
      IF (bal.credits_overtime + bal.credits_duty_off - bal.offset_used) < r.hours THEN
        RAISE EXCEPTION 'insufficient OT/duty credits';
      END IF;
      UPDATE public.leave_balances
        SET offset_used = offset_used + r.hours
        WHERE user_id = r.employee_id;
    ELSIF r.type = 'leave' AND r.leave_type_id IS NOT NULL THEN
      SELECT code INTO lt_code FROM public.leave_types WHERE id = r.leave_type_id;
      IF lt_code IS NOT NULL THEN
        cur_balance := COALESCE((bal.leave_balances->>lt_code)::numeric, 0);
        IF cur_balance < r.days THEN
          RAISE EXCEPTION 'insufficient leave balance';
        END IF;
        UPDATE public.leave_balances
          SET leave_balances = jsonb_set(
            leave_balances, ARRAY[lt_code],
            to_jsonb(cur_balance - r.days), true)
          WHERE user_id = r.employee_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = _note
    WHERE id = _request_id
    RETURNING * INTO r;
  RETURN r;
END $$;

GRANT EXECUTE ON FUNCTION public.decide_request(uuid, boolean, text) TO authenticated;

-- Seed default leave types so first-run admin has something usable
INSERT INTO public.leave_types (code, name, default_days) VALUES
  ('LT_SICK','Sick Leave',7),
  ('LT_VACATION','Vacation Leave',10),
  ('LT_EMERGENCY','Emergency Leave',3)
ON CONFLICT (code) DO NOTHING;
