-- FIX (Issue 2 — "column allow_calculator already exists" SQLSTATE 42701):
-- The idempotency migration (20260517000002) recreates subjects-adjacent tables
-- but this standalone ALTER TABLE has no IF NOT EXISTS guard. On a fresh preview
-- database the column is guaranteed to exist by the time this statement runs
-- (either from a prior run or because the idempotency migration included it).
-- ADD COLUMN IF NOT EXISTS makes this statement safe to replay.
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS allow_calculator boolean NOT NULL DEFAULT false;
