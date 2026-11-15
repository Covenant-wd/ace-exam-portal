-- supabase/migrations/20261103000008_fee_receipts.sql
-- ================================================================
-- FEE RECEIPTS: unique reference numbers + public authenticity check
--
--   * Every fee payment gets a system-generated receipt reference like
--       AHS-7K3M-9Q2X
--     = first three initials of the school name + 8 random characters.
--     It is created by the database (clients cannot choose or change it),
--     and is unique.
--   * verify_receipt(ref) lets ANYONE who scans the QR code on a printed
--     receipt confirm it is genuine (no login needed). It reveals only what
--     is printed on the receipt itself.
--
-- The existing receipt_number column is left untouched: it is still the
-- optional teller / bank reference typed in by the person recording the payment.
--
-- Idempotent.
-- ================================================================

ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS receipt_ref text;

-- ── Helpers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receipt_school_name(_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF(btrim((SELECT ss.value FROM public.school_settings ss
                  WHERE ss.school_id = _school_id AND ss.key = 'school_name' LIMIT 1)), ''),
    (SELECT s.name FROM public.schools s WHERE s.id = _school_id),
    'School'
  );
$$;

-- "Academia Heights School" -> AHS.  Fewer than 3 words: the first word's
-- following letters fill the gap ("Greenfield Academy" -> GAR).
CREATE OR REPLACE FUNCTION public.receipt_prefix(_school_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  w          text;
  first_word text;
  res        text := '';
  i          integer;
BEGIN
  FOREACH w IN ARRAY regexp_split_to_array(upper(btrim(COALESCE(_school_name, ''))), '[^A-Z]+') LOOP
    IF w <> '' THEN
      IF first_word IS NULL THEN first_word := w; END IF;
      IF length(res) < 3 THEN res := res || left(w, 1); END IF;
    END IF;
  END LOOP;

  IF res = '' THEN RETURN 'SCH'; END IF;

  i := 2;
  WHILE length(res) < 3 AND i <= length(first_word) LOOP
    res := res || substr(first_word, i, 1);
    i := i + 1;
  END LOOP;

  RETURN rpad(res, 3, 'X');
END;
$$;

-- PREFIX-XXXX-XXXX, characters picked from an alphabet without the
-- look-alikes I, O, 0, 1.
CREATE OR REPLACE FUNCTION public.generate_receipt_ref(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- byte positions of a v4 uuid that are fully random (skips version/variant bytes)
  positions constant integer[] := ARRAY[0, 1, 2, 3, 4, 5, 9, 10];
  prefix text;
  bytes  bytea;
  part   text;
  ref    text;
  p      integer;
  tries  integer := 0;
BEGIN
  prefix := public.receipt_prefix(public.receipt_school_name(_school_id));

  LOOP
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    part := '';
    FOREACH p IN ARRAY positions LOOP
      part := part || substr(alphabet, (get_byte(bytes, p) % 32) + 1, 1);
    END LOOP;
    ref := prefix || '-' || substr(part, 1, 4) || '-' || substr(part, 5, 4);

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.fee_payments fp WHERE fp.receipt_ref = ref);

    tries := tries + 1;
    IF tries > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique receipt reference';
    END IF;
  END LOOP;

  RETURN ref;
END;
$$;

REVOKE ALL ON FUNCTION public.receipt_school_name(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_receipt_ref(uuid) FROM PUBLIC, anon, authenticated;

-- ── Give existing payments a reference (one at a time so each is checked) ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, school_id FROM public.fee_payments WHERE receipt_ref IS NULL LOOP
    UPDATE public.fee_payments
       SET receipt_ref = public.generate_receipt_ref(r.school_id)
     WHERE id = r.id;
  END LOOP;
END $$;

-- ── Make it unique, always present, and impossible to forge or change ──
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_receipt_ref_key
  ON public.fee_payments (receipt_ref);

CREATE OR REPLACE FUNCTION public.fee_payments_set_receipt_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Always system-generated: a client-supplied value is ignored.
    NEW.receipt_ref := public.generate_receipt_ref(NEW.school_id);
  ELSIF OLD.receipt_ref IS NOT NULL THEN
    -- Never changes after it has been issued.
    NEW.receipt_ref := OLD.receipt_ref;
  ELSE
    NEW.receipt_ref := public.generate_receipt_ref(NEW.school_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_payments_receipt_ref ON public.fee_payments;
CREATE TRIGGER trg_fee_payments_receipt_ref
  BEFORE INSERT OR UPDATE ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_payments_set_receipt_ref();

ALTER TABLE public.fee_payments ALTER COLUMN receipt_ref SET NOT NULL;

-- ── Public authenticity check (what the QR code opens) ──────────
CREATE OR REPLACE FUNCTION public.verify_receipt(_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  logo text;
BEGIN
  SELECT fp.receipt_ref, fp.amount_paid, fp.payment_date, fp.payment_method,
         fp.created_at, fp.school_id,
         p.full_name AS student_name,
         ft.name     AS fee_name
    INTO r
  FROM public.fee_payments fp
  LEFT JOIN public.profiles  p  ON p.user_id = fp.student_id
  LEFT JOIN public.fee_types ft ON ft.id = fp.fee_type_id
  WHERE fp.receipt_ref = upper(btrim(COALESCE(_reference, '')))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT COALESCE(
           NULLIF(btrim((SELECT ss.value FROM public.school_settings ss
                         WHERE ss.school_id = r.school_id AND ss.key = 'school_logo_url' LIMIT 1)), ''),
           NULLIF((SELECT s.logo_url FROM public.schools s WHERE s.id = r.school_id), ''),
           ''
         )
    INTO logo;

  RETURN jsonb_build_object(
    'valid',          true,
    'receipt_ref',    r.receipt_ref,
    'school_name',    public.receipt_school_name(r.school_id),
    'school_logo_url', logo,
    'student_name',   r.student_name,
    'fee_name',       r.fee_name,
    'amount_paid',    r.amount_paid,
    'payment_method', r.payment_method,
    'payment_date',   r.payment_date,
    'recorded_at',    r.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_receipt(text) TO anon, authenticated;
