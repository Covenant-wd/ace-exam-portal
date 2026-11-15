-- ============================================================
-- Fix: "Failed to load registration requests" on Super Admin page
--
-- Root cause: the "Schools can view their own request" SELECT policy
-- queried `auth.users` directly (SELECT email FROM auth.users WHERE
-- id = auth.uid()). The `authenticated` Postgres role does not have
-- SELECT permission on auth.users, so evaluating this policy throws
-- "permission denied for table users". Since Postgres combines all
-- permissive SELECT policies on the table, this error surfaces even
-- for the super admin's own (otherwise valid) "view all" policy,
-- breaking the whole query.
--
-- Fix: read the email from the session JWT (auth.jwt()) instead of
-- querying auth.users. This is always accessible to authenticated
-- users and requires no table permissions.
-- ============================================================

DROP POLICY IF EXISTS "Schools can view their own request" ON public.school_registration_requests;

CREATE POLICY "Schools can view their own request"
  ON public.school_registration_requests
  FOR SELECT
  USING (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
