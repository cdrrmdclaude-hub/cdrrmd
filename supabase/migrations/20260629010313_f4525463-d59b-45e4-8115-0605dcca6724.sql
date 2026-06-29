
DROP FUNCTION IF EXISTS public.decide_request(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.decide_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL, _actor_id uuid DEFAULT NULL)
 RETURNS public.requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.requests;
  bal public.leave_balances;
  lt_code text;
  cur_balance numeric;
  actor uuid;
BEGIN
  actor := COALESCE(_actor_id, auth.uid());
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'already decided'; END IF;

  IF _approve THEN
    INSERT INTO public.leave_balances (user_id) VALUES (r.employee_id)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bal FROM public.leave_balances WHERE user_id = r.employee_id FOR UPDATE;

    IF r.type = 'overtime' THEN
      UPDATE public.leave_balances SET credits_overtime = credits_overtime + r.hours WHERE user_id = r.employee_id;
    ELSIF r.type = 'duty_off' THEN
      UPDATE public.leave_balances SET credits_duty_off = credits_duty_off + r.hours WHERE user_id = r.employee_id;
    ELSIF r.type = 'offset' THEN
      IF (bal.credits_overtime + bal.credits_duty_off - bal.offset_used) < r.hours THEN
        RAISE EXCEPTION 'insufficient OT/duty credits';
      END IF;
      UPDATE public.leave_balances SET offset_used = offset_used + r.hours WHERE user_id = r.employee_id;
    ELSIF r.type = 'leave' AND r.leave_type_id IS NOT NULL THEN
      SELECT code INTO lt_code FROM public.leave_types WHERE id = r.leave_type_id;
      IF lt_code IS NOT NULL THEN
        cur_balance := COALESCE((bal.leave_balances->>lt_code)::numeric, 0);
        IF cur_balance < r.days THEN
          RAISE EXCEPTION 'insufficient leave balance';
        END IF;
        UPDATE public.leave_balances
          SET leave_balances = jsonb_set(leave_balances, ARRAY[lt_code], to_jsonb(cur_balance - r.days), true)
          WHERE user_id = r.employee_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        decided_by = actor,
        decided_at = now(),
        decision_note = _note
    WHERE id = _request_id
    RETURNING * INTO r;
  RETURN r;
END $function$;
