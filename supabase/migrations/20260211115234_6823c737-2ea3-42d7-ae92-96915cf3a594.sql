
-- Fix overly permissive insert policies
-- The trigger runs as SECURITY DEFINER so it bypasses RLS. We can restrict these.

DROP POLICY "System inserts profiles" ON public.profiles;
DROP POLICY "System inserts roles" ON public.user_roles;

-- Only allow users to insert their own profile (trigger bypasses RLS anyway)
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only allow inserting roles for yourself (trigger bypasses RLS, admin policy covers admin actions)
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
