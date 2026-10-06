
CREATE OR REPLACE FUNCTION public.get_outreach_officers()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ur.user_id,
    au.email::text,
    COALESCE(p.full_name, au.raw_user_meta_data->>'full_name', '')::text as full_name,
    au.created_at
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'outreach_officer'
  ORDER BY au.created_at DESC;
$$;
