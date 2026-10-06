
CREATE TABLE IF NOT EXISTS public.school_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  commission_amount numeric NOT NULL DEFAULT 0,
  commission_paid boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.school_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Officers can view own referrals" ON public.school_referrals;
CREATE POLICY "Officers can view own referrals"
  ON public.school_referrals
  FOR SELECT
  TO authenticated
  USING (officer_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can manage all referrals" ON public.school_referrals;
CREATE POLICY "Super admins can manage all referrals"
  ON public.school_referrals
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
