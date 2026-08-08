-- Add exam_type and instructions columns to exams
-- ADD COLUMN IF NOT EXISTS added: these columns may already exist from a
-- prior manual migration or re-run.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS exam_type text NOT NULL DEFAULT 'mcq';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS instructions text DEFAULT '';

-- Create theory_questions table
-- IF NOT EXISTS added: idempotency migration creates this table too.
CREATE TABLE IF NOT EXISTS public.theory_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_number text NOT NULL,
  sub_label text DEFAULT '',
  question_text text NOT NULL,
  marks integer NOT NULL DEFAULT 1,
  question_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.theory_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage school theory questions" ON public.theory_questions;
CREATE POLICY "Admins can manage school theory questions"
ON public.theory_questions FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM exams e
    WHERE e.id = theory_questions.exam_id
    AND e.school_id = get_user_school_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Instructors can manage school theory questions" ON public.theory_questions;
CREATE POLICY "Instructors can manage school theory questions"
ON public.theory_questions FOR ALL
USING (
  has_role(auth.uid(), 'instructor'::app_role)
  AND EXISTS (
    SELECT 1 FROM exams e
    WHERE e.id = theory_questions.exam_id
    AND e.school_id = get_user_school_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Students can view theory questions of published exams" ON public.theory_questions;
CREATE POLICY "Students can view theory questions of published exams"
ON public.theory_questions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM exams e
    WHERE e.id = theory_questions.exam_id
    AND e.is_published = true
    AND e.school_id = get_user_school_id(auth.uid())
  )
);
