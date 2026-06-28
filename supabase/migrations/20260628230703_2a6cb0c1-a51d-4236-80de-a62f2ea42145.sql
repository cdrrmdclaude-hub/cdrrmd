REVOKE EXECUTE ON FUNCTION public.decide_request(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_request(uuid, boolean, text) TO service_role;