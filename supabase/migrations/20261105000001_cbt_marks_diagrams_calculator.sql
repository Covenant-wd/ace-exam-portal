-- supabase/migrations/20261105000001_cbt_marks_diagrams_calculator.sql
-- ================================================================
-- CBT: marks per question, teachers can add diagrams, calculator control
--
--  1. MARKS PER QUESTION
--     questions.marks (whole number 1-100, default 1). A student's score is the
--     SUM OF MARKS earned and total_questions holds the total marks available,
--     so every page that shows "score / total" keeps working. Exams where nobody
--     changed the marks (all 1) score exactly as before.
--
--  2. DIAGRAMS
--     Questions already support images through the question-images storage bucket
--     (the editor inserts ![diagram](url)). That bucket only let ADMINS upload, so
--     teachers could not add a diagram. Teachers who hold "Create & manage exams"
--     may now upload (and change / delete their own uploads). Only image types up
--     to 5 MB are accepted.
--
--  3. CALCULATOR
--     exams.allow_calculator: NULL = follow the subject's "Allow Calculator in
--     Exams" setting (as before), true = always allow, false = never allow.
--
-- Run after 20261104000001_cbt_exams_rebuild.sql. Idempotent.
-- ================================================================

-- ── 1 & 3. columns ──────────────────────────────────────────────
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS marks integer NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE public.questions ADD CONSTRAINT questions_marks_check CHECK (marks BETWEEN 1 AND 100) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS allow_calculator boolean;   -- NULL = follow the subject

-- ── functions (same names / signatures, now marks-aware) ────────
CREATE OR REPLACE FUNCTION public._grade_exam_attempt(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.student_answers sa
     SET is_correct = (sa.selected_option IS NOT NULL
                       AND upper(btrim(sa.selected_option)) = upper(btrim(q.correct_option)))
    FROM public.questions q
   WHERE sa.attempt_id = _attempt_id
     AND q.id = sa.question_id;

  UPDATE public.exam_attempts ea
     -- score = marks earned; total_questions = total marks available
     -- (every question is worth 1 mark unless the teacher set more, so exams
     --  without custom marks score exactly as before)
     SET score           = COALESCE((SELECT sum(qm.marks)::integer
                                       FROM public.student_answers a
                                       JOIN public.questions qm ON qm.id = a.question_id
                                      WHERE a.attempt_id = ea.id AND a.is_correct = true), 0),
         total_questions = COALESCE((SELECT sum(qq.marks)::integer FROM public.questions qq
                                      WHERE qq.exam_id = ea.exam_id), 0),
         is_submitted    = true,
         submitted_at    = COALESCE(ea.submitted_at, now())
   WHERE ea.id = _attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_exam    public.exams%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_subject record;
  v_remaining integer;
  v_questions jsonb;
  v_answers   jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_uid, 'student'::public.app_role) THEN
    RAISE EXCEPTION 'Only students can take exams';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS NOT TRUE
     OR v_exam.school_id IS DISTINCT FROM public.get_user_school_id(v_uid) THEN
    RAISE EXCEPTION 'This exam is not available';
  END IF;
  IF v_exam.class_id IS NOT NULL AND v_exam.class_id IS DISTINCT FROM public.get_user_class_id(v_uid) THEN
    RAISE EXCEPTION 'This exam is not assigned to your class';
  END IF;
  IF v_exam.exam_type <> 'mcq' THEN
    RAISE EXCEPTION 'This is a theory exam — it is answered on paper';
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts
   WHERE exam_id = _exam_id AND student_id = v_uid;

  -- Already finished
  IF FOUND AND v_attempt.is_submitted THEN
    RETURN jsonb_build_object(
      'status', 'submitted', 'attempt_id', v_attempt.id,
      'score', v_attempt.score, 'total_questions', v_attempt.total_questions,
      'allow_retake', v_exam.allow_retake
    );
  END IF;

  IF NOT FOUND THEN
    -- Brand-new attempt: the exam must be open and have questions
    IF v_exam.start_date IS NOT NULL AND now() < v_exam.start_date THEN
      RAISE EXCEPTION 'This exam has not started yet';
    END IF;
    IF v_exam.end_date IS NOT NULL AND now() > v_exam.end_date THEN
      RAISE EXCEPTION 'This exam is closed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.questions WHERE exam_id = _exam_id) THEN
      RAISE EXCEPTION 'This exam has no questions yet';
    END IF;

    INSERT INTO public.exam_attempts (exam_id, student_id)
    VALUES (_exam_id, v_uid)
    ON CONFLICT (exam_id, student_id) DO NOTHING;

    SELECT * INTO v_attempt FROM public.exam_attempts
     WHERE exam_id = _exam_id AND student_id = v_uid;
  ELSIF now() > v_attempt.started_at + make_interval(mins => v_exam.duration_minutes) + interval '30 seconds' THEN
    -- Resuming after the time ran out: close it with what was saved
    PERFORM public._grade_exam_attempt(v_attempt.id);
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = v_attempt.id;
    RETURN jsonb_build_object(
      'status', 'submitted', 'expired', true, 'attempt_id', v_attempt.id,
      'score', v_attempt.score, 'total_questions', v_attempt.total_questions,
      'allow_retake', v_exam.allow_retake
    );
  END IF;

  v_remaining := GREATEST(0, (v_exam.duration_minutes * 60)
                 - floor(extract(epoch FROM (now() - v_attempt.started_at)))::integer);

  SELECT jsonb_agg(
           jsonb_build_object(
             'id', q.id, 'question_text', q.question_text,
             'option_a', q.option_a, 'option_b', q.option_b,
             'option_c', q.option_c, 'option_d', q.option_d,
             'marks', q.marks)
           ORDER BY
             CASE WHEN v_exam.shuffle_questions THEN md5(v_attempt.id::text || q.id::text) END,
             q.question_order, q.created_at)
    INTO v_questions
    FROM public.questions q
   WHERE q.exam_id = _exam_id;

  SELECT COALESCE(jsonb_object_agg(sa.question_id, sa.selected_option), '{}'::jsonb)
    INTO v_answers
    FROM public.student_answers sa
   WHERE sa.attempt_id = v_attempt.id AND sa.selected_option IS NOT NULL;

  SELECT s.name, COALESCE(s.allow_calculator, false) AS allow_calculator
    INTO v_subject
    FROM public.subjects s WHERE s.id = v_exam.subject_id;

  RETURN jsonb_build_object(
    'status',            'in_progress',
    'attempt_id',        v_attempt.id,
    'started_at',        v_attempt.started_at,
    'remaining_seconds', v_remaining,
    'violations',        v_attempt.violations,
    'max_violations',    3,
    'exam', jsonb_build_object(
      'id', v_exam.id, 'title', v_exam.title, 'description', v_exam.description,
      'instructions', v_exam.instructions, 'duration_minutes', v_exam.duration_minutes,
      'subject_name', v_subject.name,
      -- the exam's own setting wins; NULL means "follow the subject"
      'allow_calculator', COALESCE(v_exam.allow_calculator, v_subject.allow_calculator, false),
      'total_marks', (SELECT COALESCE(sum(qt.marks), 0) FROM public.questions qt WHERE qt.exam_id = _exam_id)),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'answers',   v_answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exam_intro(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_exam    public.exams%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_has_att boolean;
  v_subject record;
  v_qcount  integer;
  v_tcount  integer;
  v_state   text;
  v_remaining integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'student'::public.app_role) THEN
    RAISE EXCEPTION 'Only students can open exams';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS NOT TRUE
     OR v_exam.school_id IS DISTINCT FROM public.get_user_school_id(v_uid)
     OR (v_exam.class_id IS NOT NULL AND v_exam.class_id IS DISTINCT FROM public.get_user_class_id(v_uid)) THEN
    RAISE EXCEPTION 'This exam is not available';
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE exam_id = _exam_id AND student_id = v_uid;
  v_has_att := FOUND;

  SELECT s.name, COALESCE(s.allow_calculator, false) AS allow_calculator
    INTO v_subject FROM public.subjects s WHERE s.id = v_exam.subject_id;
  SELECT count(*) INTO v_qcount FROM public.questions WHERE exam_id = _exam_id;
  SELECT count(*) INTO v_tcount FROM public.theory_questions WHERE exam_id = _exam_id;

  IF v_has_att AND v_attempt.is_submitted THEN
    v_state := 'submitted';
  ELSIF v_has_att THEN
    v_remaining := GREATEST(0, (v_exam.duration_minutes * 60)
                   - floor(extract(epoch FROM (now() - v_attempt.started_at)))::integer);
    v_state := CASE WHEN now() > v_attempt.started_at + make_interval(mins => v_exam.duration_minutes)
                         + interval '30 seconds' THEN 'expired' ELSE 'in_progress' END;
  ELSIF v_exam.start_date IS NOT NULL AND now() < v_exam.start_date THEN
    v_state := 'not_started';
  ELSIF v_exam.end_date IS NOT NULL AND now() > v_exam.end_date THEN
    v_state := 'closed';
  ELSIF v_exam.exam_type = 'mcq' AND v_qcount = 0 THEN
    v_state := 'no_questions';
  ELSE
    v_state := 'available';
  END IF;

  RETURN jsonb_build_object(
    'state', v_state,
    'exam', jsonb_build_object(
      'id', v_exam.id, 'title', v_exam.title, 'description', v_exam.description,
      'instructions', v_exam.instructions, 'exam_type', v_exam.exam_type,
      'duration_minutes', v_exam.duration_minutes,
      'start_date', v_exam.start_date, 'end_date', v_exam.end_date,
      'allow_retake', v_exam.allow_retake,
      'subject_name', v_subject.name,
      'allow_calculator', COALESCE(v_exam.allow_calculator, v_subject.allow_calculator, false),
      'total_marks', (SELECT COALESCE(sum(qt.marks), 0) FROM public.questions qt WHERE qt.exam_id = _exam_id),
      'question_count', CASE WHEN v_exam.exam_type = 'theory' THEN v_tcount ELSE v_qcount END),
    'attempt', CASE WHEN v_has_att THEN jsonb_build_object(
      'id', v_attempt.id, 'is_submitted', v_attempt.is_submitted,
      'score', v_attempt.score, 'total_questions', v_attempt.total_questions,
      'violations', v_attempt.violations, 'remaining_seconds', v_remaining) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_intro(uuid)     TO authenticated;
REVOKE ALL ON FUNCTION public._grade_exam_attempt(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. diagrams: let exam managers upload to the question-images bucket ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- images only, 5 MB max (SVG is left out on purpose: it can carry scripts)
UPDATE storage.buckets
   SET file_size_limit    = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'question-images';

DROP POLICY IF EXISTS "Admins can upload question images"        ON storage.objects;
DROP POLICY IF EXISTS "Admins can update question images"        ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete question images"        ON storage.objects;
DROP POLICY IF EXISTS "Exam managers can upload question images" ON storage.objects;
DROP POLICY IF EXISTS "Exam managers can update question images" ON storage.objects;
DROP POLICY IF EXISTS "Exam managers can delete question images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view question images"          ON storage.objects;

CREATE POLICY "Exam managers can upload question images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (public.has_role(auth.uid(), 'instructor'::public.app_role)
          AND EXISTS (SELECT 1 FROM public.instructor_permissions ip
                      WHERE ip.instructor_id = auth.uid() AND ip.can_manage_exams = true))
    )
  );

-- admins may change / delete any image; teachers only the ones they uploaded
CREATE POLICY "Exam managers can update question images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (owner = auth.uid() AND public.has_role(auth.uid(), 'instructor'::public.app_role))
    )
  );

CREATE POLICY "Exam managers can delete question images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'question-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (owner = auth.uid() AND public.has_role(auth.uid(), 'instructor'::public.app_role))
    )
  );

CREATE POLICY "Anyone can view question images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');
