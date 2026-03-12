CREATE POLICY "Super admins can manage school_settings"
ON public.school_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));