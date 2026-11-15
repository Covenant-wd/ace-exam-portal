-- ============================================================
-- Add phone_number to profiles (foundation for future Bulk SMS)
--
-- This migration ONLY adds a column. It does not create any SMS
-- table, function, or Edge Function, and does not touch RLS.
--
-- Nullable by design: existing students, parents, and instructors
-- have no phone number on file today. Making this NOT NULL would
-- break every existing row, so it stays optional until phone
-- numbers are collected and normalized. No format/CHECK constraint
-- is added yet either — Nigerian numbers are entered in a few
-- different valid shapes (e.g. 080..., +234..., 234...), and that
-- normalization is deferred to the Bulk SMS feature itself.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT NULL;

COMMENT ON COLUMN public.profiles.phone_number IS
  'Optional contact phone number for students, parents, and instructors. Unformatted/unnormalized — foundation column for the future Bulk SMS feature. No format constraint yet.';
