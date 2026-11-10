-- supabase/migrations/20261104000001_cbt_exams_rebuild.sql
-- ================================================================
-- REBUILD OF THE IN-APP CBT EXAM SYSTEM (database side)
--
-- WHERE THINGS STOOD
--   Migration 20260528000001_cbt_external_migration.sql "retired" the in-app CBT:
--     * REVOKEd INSERT/UPDATE/DELETE on the five exam tables from `authenticated`,
--     * dropped every write policy,
--     * set can_manage_exams = false for every instructor,
--     * stamped the tables "DEPRECATED".
--   The tables and all historical data were kept. On top of that, two old read
--   rules were still leaking:
--     * any student could read every published exam of every school and
--       the QUESTIONS WITH THEIR CORRECT ANSWERS;
--     * admins could see other schools' attempts and answers;
--     * teachers were matched on subject only (not class) and the
--       can_manage_exams permission was never checked.
--
-- WHAT THIS MIGRATION DOES
--   1. Teachers manage an exam only when they hold can_manage_exams AND are
--      assigned that exact subject + class (instructor_subjects).
--   2. Everything is school-scoped. Admins manage their own school's exams.
--   3. Students never read the questions table. They take an exam through
--      server functions that: check access (class / window / published),
--      send questions WITHOUT the answers, autosave answers, enforce the
--      timer, count anti-cheat violations and GRADE ON THE SERVER.
--   4. Result consumers (Results, student results, parent dashboard) keep
--      reading exam_attempts exactly as before.
--
-- Fully idempotent. Existing exams / attempts / answers are untouched.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. Columns (IF NOT EXISTS: allow_retake already exists on live DBs but
--    was never in a migration)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS allow_retake      boolean NOT NULL DEFAULT false;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT false;

-- NOT VALID: protects new/changed rows without failing on any odd legacy row.
DO $$ BEGIN
  ALTER TABLE public.exams ADD CONSTRAINT exams_exam_type_check
    CHECK (exam_type IN ('mcq', 'theory')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.exams ADD CONSTRAINT exams_duration_check
    CHECK (duration_minutes BETWEEN 1 AND 600) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.exams ADD CONSTRAINT exams_window_check
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date > start_date) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_exams_school_class   ON public.exams (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject        ON public.exams (subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam       ON public.questions (exam_id, question_order);
CREATE INDEX IF NOT EXISTS idx_theory_questions_exam ON public.theory_questions (exam_id, question_order);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON public.exam_attempts (student_id);


-- ────────────────────────────────────────────────────────────────
-- 1b. Table permissions (undoing the REVOKE) — as little as possible
--     RLS below decides WHICH rows; these decide whether writing is even possible.
--       exams / questions / theory_questions : teachers + admins write (RLS-gated)
--       exam_attempts : only DELETE (a teacher/admin letting a student retake)
--       student_answers : no direct writes at all
--     Students never write attempts or answers directly: only the
--     SECURITY DEFINER functions in section 4 do, so even a mistake in a policy
--     could not let a student change a score.
-- ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exams            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.questions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.theory_questions TO authenticated;
GRANT SELECT, DELETE                 ON TABLE public.exam_attempts    TO authenticated;
GRANT SELECT                         ON TABLE public.student_answers  TO authenticated;
REVOKE INSERT, UPDATE ON TABLE public.exam_attempts   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.student_answers FROM authenticated;

COMMENT ON TABLE public.exams            IS 'In-app CBT exams (multiple-choice and theory). Managed by admins and by teachers for their assigned subject + class.';
COMMENT ON TABLE public.questions        IS 'Multiple-choice questions incl. the correct answer. Never readable by students; they receive questions through start_exam_attempt().';
COMMENT ON TABLE public.theory_questions IS 'Theory question paper (display only, answered on paper).';
COMMENT ON TABLE public.exam_attempts    IS 'One row per student per exam. Written ONLY by the exam functions (start/submit/violation), graded on the server.';
COMMENT ON TABLE public.student_answers  IS 'A student''s selected option per question. Written ONLY by the exam functions.';


-- ────────────────────────────────────────────────────────────────
-- 2. Helper functions
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_class_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.class_id FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1;
$$;

-- May this instructor create / edit / delete / publish exams for this exact
-- subject + class?  Needs the can_manage_exams permission AND the assignment.
CREATE OR REPLACE FUNCTION public.instructor_can_manage_exam(
  _instructor_id uuid,
  _subject_id    uuid,
  _class_id      uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _instructor_id IS NOT NULL
    AND _subject_id IS NOT NULL
    AND _class_id   IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = _instructor_id AND ip.can_manage_exams = true
    )
    AND EXISTS (
      SELECT 1 FROM public.instructor_subjects ins
      WHERE ins.instructor_id = _instructor_id
        AND ins.subject_id    = _subject_id
        AND ins.class_id      = _class_id
        AND ins.school_id     = public.get_user_school_id(_instructor_id)
    );
$$;

-- The exams policies must look at exam_attempts, while exam_attempts policies
-- look at exams.  Asking through SECURITY DEFINER functions (which skip RLS)
-- breaks that circle; asking directly raised "infinite recursion detected in
-- policy for relation exams".
CREATE OR REPLACE FUNCTION public.student_has_exam_attempt(_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.exam_attempts ea
                 WHERE ea.exam_id = _exam_id AND ea.student_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_user_class_id(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.instructor_can_manage_exam(uuid, uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_exam_attempt(uuid)                TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.exams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theory_questions ENABLE ROW LEVEL SECURITY;

-- ── exams ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view published exams"               ON public.exams;
DROP POLICY IF EXISTS "Admins can view all exams"                        ON public.exams;
DROP POLICY IF EXISTS "Admins can manage exams"                          ON public.exams;
DROP POLICY IF EXISTS "Subject instructors can manage own subject exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can manage school exams"                   ON public.exams;
DROP POLICY IF EXISTS "Instructors can manage assigned exams"            ON public.exams;
DROP POLICY IF EXISTS "Instructors can view own subject class exams"     ON public.exams;
DROP POLICY IF EXISTS "Students can view own class exams"                ON public.exams;

CREATE POLICY "Admins can manage school exams"
  ON public.exams FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'admin'::public.app_role) AND school_id = public.get_user_school_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND school_id = public.get_user_school_id(auth.uid()));

CREATE POLICY "Instructors can manage assigned exams"
  ON public.exams FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
    AND public.instructor_can_manage_exam(auth.uid(), subject_id, class_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
    AND public.instructor_can_manage_exam(auth.uid(), subject_id, class_id)
  );

-- Teachers who teach the subject in that class can also SEE its exams (for results)
CREATE POLICY "Instructors can view own subject class exams"
  ON public.exams FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
    AND class_id IS NOT NULL
    AND public.is_subject_instructor(auth.uid(), subject_id, class_id)
  );

-- Students: published exams for their own class (or whole-school exams), plus
-- any exam they already have an attempt on (so past results keep their titles).
CREATE POLICY "Students can view own class exams"
  ON public.exams FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'student'::public.app_role)
    AND school_id = public.get_user_school_id(auth.uid())
    AND (
      (is_published = true AND (class_id IS NULL OR class_id = public.get_user_class_id(auth.uid())))
      OR public.student_has_exam_attempt(exams.id)
    )
  );

-- ── questions (students NEVER read this table — it holds the answers) ──
DROP POLICY IF EXISTS "Students can view questions of published exams"           ON public.questions;
DROP POLICY IF EXISTS "Admins can manage questions"                              ON public.questions;
DROP POLICY IF EXISTS "Subject instructors can manage own subject questions"     ON public.questions;
DROP POLICY IF EXISTS "Admins can manage school questions"                       ON public.questions;
DROP POLICY IF EXISTS "Instructors can manage assigned exam questions"           ON public.questions;

CREATE POLICY "Admins can manage school questions"
  ON public.questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = questions.exam_id AND e.school_id = public.get_user_school_id(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = questions.exam_id AND e.school_id = public.get_user_school_id(auth.uid())));

CREATE POLICY "Instructors can manage assigned exam questions"
  ON public.questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.instructor_can_manage_exam(auth.uid(), e.subject_id, e.class_id)))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.instructor_can_manage_exam(auth.uid(), e.subject_id, e.class_id)));

-- ── theory_questions (display-only paper: no answers, so students may read) ──
DROP POLICY IF EXISTS "Admins can manage school theory questions"                  ON public.theory_questions;
DROP POLICY IF EXISTS "Instructors can manage school theory questions"             ON public.theory_questions;
DROP POLICY IF EXISTS "Students can view theory questions of published exams"      ON public.theory_questions;
DROP POLICY IF EXISTS "Instructors can manage assigned theory questions"           ON public.theory_questions;
DROP POLICY IF EXISTS "Students can view open theory questions of own class"       ON public.theory_questions;

CREATE POLICY "Admins can manage school theory questions"
  ON public.theory_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = theory_questions.exam_id AND e.school_id = public.get_user_school_id(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = theory_questions.exam_id AND e.school_id = public.get_user_school_id(auth.uid())));

CREATE POLICY "Instructors can manage assigned theory questions"
  ON public.theory_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = theory_questions.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.instructor_can_manage_exam(auth.uid(), e.subject_id, e.class_id)))
  WITH CHECK (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = theory_questions.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.instructor_can_manage_exam(auth.uid(), e.subject_id, e.class_id)));

CREATE POLICY "Students can view open theory questions of own class"
  ON public.theory_questions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'student'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = theory_questions.exam_id
        AND e.is_published = true
        AND e.school_id = public.get_user_school_id(auth.uid())
        AND (e.class_id IS NULL OR e.class_id = public.get_user_class_id(auth.uid()))
        AND (e.start_date IS NULL OR e.start_date <= now())
        AND (e.end_date   IS NULL OR e.end_date   >= now())
    )
  );

-- ── exam_attempts (students can READ their own; all writes go through the functions below) ──
DROP POLICY IF EXISTS "Students can insert own attempts"                            ON public.exam_attempts;
DROP POLICY IF EXISTS "Students can update own attempts"                            ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can view all attempts"                                ON public.exam_attempts;
DROP POLICY IF EXISTS "Subject instructors can view own subject exam attempts"      ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can view school attempts"                             ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can delete school attempts"                           ON public.exam_attempts;
DROP POLICY IF EXISTS "Instructors can view own subject class attempts"             ON public.exam_attempts;
DROP POLICY IF EXISTS "Instructors can delete assigned exam attempts"               ON public.exam_attempts;

CREATE POLICY "Admins can view school attempts"
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.school_id = public.get_user_school_id(auth.uid())));

CREATE POLICY "Admins can delete school attempts"
  ON public.exam_attempts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.school_id = public.get_user_school_id(auth.uid())));

-- Teacher sees attempts only of THEIR subject in THEIR class
-- (the student's class is read through get_user_class_id(): a teacher who teaches a
--  subject but is not the class teacher is not allowed to read the profiles table)
CREATE POLICY "Instructors can view own subject class attempts"
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1
    FROM public.exams e
    WHERE e.id = exam_attempts.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.is_subject_instructor(auth.uid(), e.subject_id,
                                       public.get_user_class_id(exam_attempts.student_id))));

-- Letting a student retake = deleting their attempt (only the exam's managers)
CREATE POLICY "Instructors can delete assigned exam attempts"
  ON public.exam_attempts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_attempts.exam_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.instructor_can_manage_exam(auth.uid(), e.subject_id, e.class_id)));

-- ── student_answers (read-only for everyone; written only by the functions below) ──
DROP POLICY IF EXISTS "Students can insert own answers"   ON public.student_answers;
DROP POLICY IF EXISTS "Students can update own answers"   ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view all answers"       ON public.student_answers;
DROP POLICY IF EXISTS "Admins can view school answers"    ON public.student_answers;

CREATE POLICY "Admins can view school answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    WHERE ea.id = student_answers.attempt_id AND e.school_id = public.get_user_school_id(auth.uid())));

-- Teachers see the answers of students in the class they teach that subject to.
-- (replaces the older rule of the same name, which joined profiles and therefore
--  returned nothing for a teacher who is not also the class teacher)
DROP POLICY IF EXISTS "Instructors can view assigned class answers" ON public.student_answers;
CREATE POLICY "Instructors can view assigned class answers"
  ON public.student_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'instructor'::public.app_role) AND EXISTS (
    SELECT 1
    FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    WHERE ea.id = student_answers.attempt_id
      AND e.school_id = public.get_user_school_id(auth.uid())
      AND public.is_subject_instructor(auth.uid(), e.subject_id,
                                       public.get_user_class_id(ea.student_id))));

-- (kept as it is: "Students can view own answers")

-- ── Parents (the parent_students table exists on live databases) ──
DO $do$
BEGIN
  IF to_regclass('public.parent_students') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Parents can view children exam attempts" ON public.exam_attempts';
    EXECUTE $p$CREATE POLICY "Parents can view children exam attempts"
      ON public.exam_attempts FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.parent_students ps
                     WHERE ps.parent_id = auth.uid() AND ps.student_id = exam_attempts.student_id))$p$;

    -- (through a SECURITY DEFINER function for the same recursion reason as above)
    EXECUTE $f$CREATE OR REPLACE FUNCTION public.parent_child_has_exam_attempt(_exam_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $b$
        SELECT EXISTS (SELECT 1 FROM public.exam_attempts ea
                       JOIN public.parent_students ps ON ps.student_id = ea.student_id
                       WHERE ea.exam_id = _exam_id AND ps.parent_id = auth.uid())
      $b$$f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.parent_child_has_exam_attempt(uuid) TO authenticated';

    EXECUTE 'DROP POLICY IF EXISTS "Parents can view exams their children took" ON public.exams';
    EXECUTE $p$CREATE POLICY "Parents can view exams their children took"
      ON public.exams FOR SELECT TO authenticated
      USING (public.parent_child_has_exam_attempt(exams.id))$p$;
  END IF;
END
$do$;


-- ────────────────────────────────────────────────────────────────
-- 4. SERVER-SIDE EXAM FUNCTIONS (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────────

-- Constants kept in one place
--   grace after the timer ends before answers are refused: 30 s
--   violations (tab switches etc.) that trigger an automatic submit: 3

-- Internal: grade an attempt from the answers saved so far.  Not callable by clients.
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
     SET score           = (SELECT count(*) FROM public.student_answers a
                            WHERE a.attempt_id = ea.id AND a.is_correct = true),
         total_questions = (SELECT count(*) FROM public.questions qq WHERE qq.exam_id = ea.exam_id),
         is_submitted    = true,
         submitted_at    = COALESCE(ea.submitted_at, now())
   WHERE ea.id = _attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION public._grade_exam_attempt(uuid) FROM PUBLIC, anon, authenticated;


-- Internal: save answers {question_id: "A"|"B"|"C"|"D"|null} for an attempt
CREATE OR REPLACE FUNCTION public._save_exam_answers(_attempt_id uuid, _exam_id uuid, _answers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' THEN
    RETURN;
  END IF;

  INSERT INTO public.student_answers (attempt_id, question_id, selected_option)
  SELECT _attempt_id, q.id, upper(a.value)
    FROM jsonb_each_text(_answers) a
    JOIN public.questions q ON q.id::text = a.key AND q.exam_id = _exam_id
   WHERE upper(a.value) IN ('A', 'B', 'C', 'D')
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET selected_option = EXCLUDED.selected_option, is_correct = NULL;

  -- a null / empty value clears the answer
  DELETE FROM public.student_answers sa
   USING jsonb_each_text(_answers) a, public.questions q
   WHERE sa.attempt_id = _attempt_id
     AND q.id::text = a.key AND q.exam_id = _exam_id
     AND sa.question_id = q.id
     AND (a.value IS NULL OR btrim(a.value) = '');
END;
$$;

REVOKE ALL ON FUNCTION public._save_exam_answers(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;


-- Start (or resume) an attempt.  Returns the exam, the remaining time and the
-- questions WITHOUT their correct answers.
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
             'option_c', q.option_c, 'option_d', q.option_d)
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
      'subject_name', v_subject.name, 'allow_calculator', COALESCE(v_subject.allow_calculator, false)),
    'questions', COALESCE(v_questions, '[]'::jsonb),
    'answers',   v_answers
  );
END;
$$;

-- Everything the "instructions" screen needs, in one call, WITHOUT starting the clock.
-- state: available | not_started | closed | no_questions | in_progress | expired | submitted
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
      'allow_calculator', COALESCE(v_subject.allow_calculator, false),
      'question_count', CASE WHEN v_exam.exam_type = 'theory' THEN v_tcount ELSE v_qcount END),
    'attempt', CASE WHEN v_has_att THEN jsonb_build_object(
      'id', v_attempt.id, 'is_submitted', v_attempt.is_submitted,
      'score', v_attempt.score, 'total_questions', v_attempt.total_questions,
      'violations', v_attempt.violations, 'remaining_seconds', v_remaining) ELSE NULL END
  );
END;
$$;

-- Autosave while the student answers
CREATE OR REPLACE FUNCTION public.save_exam_answers(_attempt_id uuid, _answers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam    public.exams%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts
   WHERE id = _attempt_id AND student_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF v_attempt.is_submitted THEN RAISE EXCEPTION 'This exam has already been submitted'; END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF now() > v_attempt.started_at + make_interval(mins => v_exam.duration_minutes) + interval '30 seconds' THEN
    RAISE EXCEPTION 'Time is up';
  END IF;

  PERFORM public._save_exam_answers(_attempt_id, v_attempt.exam_id, _answers);
END;
$$;

-- Final submit: saves the last answers, grades on the server, returns the score
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(_attempt_id uuid, _answers jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam    public.exams%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts
   WHERE id = _attempt_id AND student_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF NOT v_attempt.is_submitted THEN
    SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
    -- Last answers are accepted only if they arrive within a minute of the timer ending
    IF now() <= v_attempt.started_at + make_interval(mins => v_exam.duration_minutes) + interval '60 seconds' THEN
      PERFORM public._save_exam_answers(_attempt_id, v_attempt.exam_id, _answers);
    END IF;
    PERFORM public._grade_exam_attempt(_attempt_id);
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id, 'score', v_attempt.score,
    'total_questions', v_attempt.total_questions,
    'percentage', CASE WHEN COALESCE(v_attempt.total_questions, 0) > 0
                       THEN round(100.0 * v_attempt.score / v_attempt.total_questions) ELSE 0 END
  );
END;
$$;

-- Anti-cheat: the screen reports a tab switch / leaving fullscreen
CREATE OR REPLACE FUNCTION public.report_exam_violation(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  c_max constant integer := 3;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts
   WHERE id = _attempt_id AND student_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF v_attempt.is_submitted THEN
    RETURN jsonb_build_object('violations', v_attempt.violations, 'auto_submitted', false,
                              'max_violations', c_max);
  END IF;

  UPDATE public.exam_attempts SET violations = violations + 1
   WHERE id = _attempt_id
   RETURNING * INTO v_attempt;

  IF v_attempt.violations >= c_max THEN
    PERFORM public._grade_exam_attempt(_attempt_id);
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
    RETURN jsonb_build_object(
      'violations', v_attempt.violations, 'auto_submitted', true, 'max_violations', c_max,
      'score', v_attempt.score, 'total_questions', v_attempt.total_questions);
  END IF;

  RETURN jsonb_build_object('violations', v_attempt.violations, 'auto_submitted', false,
                            'max_violations', c_max);
END;
$$;

-- Retake (same name and signature as before, but now it enforces the rules)
CREATE OR REPLACE FUNCTION public.reset_exam_attempt(_exam_id uuid, _student_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exam    public.exams%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_new_id  uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _student_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot reset another student''s attempt';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS NOT TRUE
     OR v_exam.school_id IS DISTINCT FROM public.get_user_school_id(_student_id)
     OR (v_exam.class_id IS NOT NULL AND v_exam.class_id IS DISTINCT FROM public.get_user_class_id(_student_id)) THEN
    RAISE EXCEPTION 'This exam is not available';
  END IF;
  IF v_exam.allow_retake IS NOT TRUE THEN
    RAISE EXCEPTION 'Retakes are not allowed for this exam';
  END IF;
  IF v_exam.end_date IS NOT NULL AND now() > v_exam.end_date THEN
    RAISE EXCEPTION 'This exam is closed';
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts
   WHERE exam_id = _exam_id AND student_id = _student_id;
  IF FOUND AND NOT v_attempt.is_submitted THEN
    RETURN v_attempt.id;                       -- nothing to reset, just continue
  END IF;

  DELETE FROM public.exam_attempts WHERE exam_id = _exam_id AND student_id = _student_id;
  INSERT INTO public.exam_attempts (exam_id, student_id) VALUES (_exam_id, _student_id)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;

-- After correcting a wrong answer key, re-grade everyone who already submitted
CREATE OR REPLACE FUNCTION public.regrade_exam(_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  r      record;
  n      integer := 0;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;

  IF NOT (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
       AND v_exam.school_id = public.get_user_school_id(auth.uid()))
    OR (public.has_role(auth.uid(), 'instructor'::public.app_role)
       AND v_exam.school_id = public.get_user_school_id(auth.uid())
       AND public.instructor_can_manage_exam(auth.uid(), v_exam.subject_id, v_exam.class_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR r IN SELECT id FROM public.exam_attempts WHERE exam_id = _exam_id AND is_submitted = true LOOP
    PERFORM public._grade_exam_attempt(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Student names + classes for an exam's results.  Teachers cannot read other
-- people's profile rows, so the Results and Review screens get names from here.
-- Allowed: admins of the school, and teachers of that subject in the student's class.
CREATE OR REPLACE FUNCTION public.get_exam_result_students(_exam_id uuid)
RETURNS TABLE(user_id uuid, full_name text, class_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
BEGIN
  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.school_id IS DISTINCT FROM public.get_user_school_id(auth.uid()) THEN
    RETURN;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN QUERY
      SELECT p.user_id, p.full_name::text, c.name::text
        FROM public.exam_attempts ea
        JOIN public.profiles p ON p.user_id = ea.student_id
        LEFT JOIN public.classes c ON c.id = p.class_id
       WHERE ea.exam_id = _exam_id;
  ELSIF public.has_role(auth.uid(), 'instructor'::public.app_role) THEN
    RETURN QUERY
      SELECT p.user_id, p.full_name::text, c.name::text
        FROM public.exam_attempts ea
        JOIN public.profiles p ON p.user_id = ea.student_id
        LEFT JOIN public.classes c ON c.id = p.class_id
       WHERE ea.exam_id = _exam_id
         AND public.is_subject_instructor(auth.uid(), v_exam.subject_id, p.class_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_result_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_result_students(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_exam_intro(uuid)                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_intro(uuid)             TO authenticated;
REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_exam_answers(uuid, jsonb)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, jsonb)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_exam_violation(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_exam_attempt(uuid, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regrade_exam(uuid)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answers(uuid, jsonb)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_exam_violation(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_exam_attempt(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.regrade_exam(uuid)               TO authenticated;
