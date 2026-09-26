-- ============================================================
-- Fix: "column reference \"status\" is ambiguous" when rejecting a
-- school registration request.
--
-- Root cause: RETURNS TABLE (... status TEXT ...) on
-- reject_school_registration implicitly declares a PL/pgSQL variable
-- named `status` in the function body (one per output column). The
-- function body then did:
--
--   SELECT email::TEXT, status::TEXT
--   INTO _email, _status
--   FROM public.school_registration_requests
--   WHERE id = _req_id;
--
-- The bare `status` in that SELECT list is ambiguous — Postgres
-- can't tell whether it means the table's `status` column or the
-- function's own `status` OUT variable, and errors instead of
-- guessing. (`email` isn't an OUT column name, so it wasn't
-- ambiguous — only `status` collided.)
--
-- Fix: alias the table in the SELECT and qualify the column
-- reference (r.status) so it's unambiguous.
-- ============================================================

DROP FUNCTION IF EXISTS public.reject_school_registration(UUID, UUID, TEXT);

CREATE FUNCTION public.reject_school_registration(
  _req_id UUID,
  _reviewed_by UUID,
  _rejection_reason TEXT
)
RETURNS TABLE (
  school_id UUID,
  admin_email TEXT,
  status TEXT,
  rejection_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email  TEXT;
  _status TEXT;
BEGIN
  SELECT r.email::TEXT, r.status::TEXT
  INTO _email, _status
  FROM public.school_registration_requests r
  WHERE r.id = _req_id;

  IF _email IS NULL THEN
    RAISE EXCEPTION 'Registration request not found';
  END IF;

  IF _status != 'pending' THEN
    RAISE EXCEPTION 'Registration request is not pending (status: %)', _status;
  END IF;

  UPDATE public.school_registration_requests
  SET status = 'rejected',
      rejection_reason = _rejection_reason,
      reviewed_by = _reviewed_by,
      reviewed_at = NOW()
  WHERE id = _req_id;

  RETURN QUERY
  SELECT NULL::UUID, _email::TEXT, 'rejected'::TEXT, _rejection_reason::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_school_registration(UUID, UUID, TEXT) TO service_role;
