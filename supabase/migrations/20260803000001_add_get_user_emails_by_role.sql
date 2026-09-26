-- ================================================================
-- FIX: get_user_emails_by_role() was being called by the
-- handle-school-registration edge function (to notify all Super
-- Admins of a new registration request) but was never actually
-- defined in any migration. Every call to it failed with
-- "function public.get_user_emails_by_role does not exist",
-- which was silently swallowed by a try/catch — so Super Admins
-- never received registration-request notification emails.
--
-- This function is intentionally granted ONLY to the service_role
-- (used by edge functions with the service-role key), not to
-- "authenticated" or "anon". It deliberately has no auth.uid()
-- caller check (unlike get_user_emails_by_ids), because it needs
-- to work when invoked from a server-side edge function on behalf
-- of an anonymous/unauthenticated site visitor (e.g. someone
-- submitting the public School Registration or Implementation
-- Request forms who is not logged in at all). Restricting EXECUTE
-- to service_role is what keeps this safe — regular client-side
-- callers (anon/authenticated) cannot call it directly.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_user_emails_by_role(_role text)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.id AS user_id, LOWER(u.email) AS email
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.role::text = _role
    AND u.email IS NOT NULL
    AND u.deleted_at IS NULL;
END;
$$;

-- Only server-side (service role) callers may use this — never anon/authenticated.
REVOKE ALL ON FUNCTION public.get_user_emails_by_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_emails_by_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_emails_by_role(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails_by_role(text) TO service_role;
