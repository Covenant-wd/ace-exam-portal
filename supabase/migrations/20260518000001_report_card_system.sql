-- ================================================================
-- REPORT CARD SYSTEM
-- Adds three new tables for full Nigerian-style report card support.
-- All statements are fully idempotent (IF NOT EXISTS, ADD COLUMN IF
-- NOT EXISTS, DO $$/EXCEPTION). Nothing existing is modified.
-- ================================================================

-- ----------------------------------------------------------------
-- TABLE 1: report_card_metadata
-- One row per student per term.  Stores the "header" data that
-- lives outside the grades table: attendance summary, comments,
-- class position, reopening date, and publication flag.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_metadata (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id               UUID        NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id              UUID        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id             UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Attendance summary — all four values entered manually by admin/class teacher.
  -- times_school_opened: how many days school held that term (e.g. 120).
  -- times_present/absent/punctual can be auto-filled from the attendance table
  -- via the "Auto-fill" button in the admin UI, or overridden manually.
  times_school_opened   SMALLINT    NOT NULL DEFAULT 0,
  times_present         SMALLINT    NOT NULL DEFAULT 0,
  times_absent          SMALLINT    NOT NULL DEFAULT 0,
  times_punctual        SMALLINT    NOT NULL DEFAULT 0,

  -- Computed on publish; stored so historical records survive class changes
  class_position        SMALLINT,
  total_students        SMALLINT,

  -- Comments
  class_teacher_comment TEXT        NOT NULL DEFAULT '',
  principal_comment     TEXT        NOT NULL DEFAULT '',

  -- Misc
  reopening_date        DATE,
  is_published          BOOLEAN     NOT NULL DEFAULT false,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (student_id, term_id)
);

ALTER TABLE public.report_card_metadata ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_report_card_metadata_updated_at ON public.report_card_metadata;
CREATE TRIGGER update_report_card_metadata_updated_at
  BEFORE UPDATE ON public.report_card_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------
-- TABLE 2: psychomotor_ratings
-- 1–6 rating scale for each psychomotor skill per student per term.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.psychomotor_ratings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id          UUID        NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  school_id        UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  verbal_fluency   SMALLINT    CHECK (verbal_fluency   BETWEEN 1 AND 6),
  handwriting      SMALLINT    CHECK (handwriting      BETWEEN 1 AND 6),
  sports           SMALLINT    CHECK (sports           BETWEEN 1 AND 6),
  games            SMALLINT    CHECK (games            BETWEEN 1 AND 6),
  musical_skills   SMALLINT    CHECK (musical_skills   BETWEEN 1 AND 6),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (student_id, term_id)
);

ALTER TABLE public.psychomotor_ratings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_psychomotor_ratings_updated_at ON public.psychomotor_ratings;
CREATE TRIGGER update_psychomotor_ratings_updated_at
  BEFORE UPDATE ON public.psychomotor_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------
-- TABLE 3: affective_ratings
-- 1–6 rating scale for each affective/behavioural trait per student
-- per term.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affective_ratings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id               UUID        NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  school_id             UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  punctuality           SMALLINT    CHECK (punctuality           BETWEEN 1 AND 6),
  neatness              SMALLINT    CHECK (neatness              BETWEEN 1 AND 6),
  politeness            SMALLINT    CHECK (politeness            BETWEEN 1 AND 6),
  honesty               SMALLINT    CHECK (honesty               BETWEEN 1 AND 6),
  cooperation           SMALLINT    CHECK (cooperation           BETWEEN 1 AND 6),
  relationship          SMALLINT    CHECK (relationship          BETWEEN 1 AND 6),
  leadership            SMALLINT    CHECK (leadership            BETWEEN 1 AND 6),
  emotional_stability   SMALLINT    CHECK (emotional_stability   BETWEEN 1 AND 6),
  health                SMALLINT    CHECK (health                BETWEEN 1 AND 6),
  attitude_to_work      SMALLINT    CHECK (attitude_to_work      BETWEEN 1 AND 6),
  attentiveness         SMALLINT    CHECK (attentiveness         BETWEEN 1 AND 6),
  reliability           SMALLINT    CHECK (reliability           BETWEEN 1 AND 6),
  initiative            SMALLINT    CHECK (initiative            BETWEEN 1 AND 6),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (student_id, term_id)
);

ALTER TABLE public.affective_ratings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_affective_ratings_updated_at ON public.affective_ratings;
CREATE TRIGGER update_affective_ratings_updated_at
  BEFORE UPDATE ON public.affective_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- RLS POLICIES
-- Pattern mirrors grades / attendance: admins full access,
-- class instructors can manage their assigned classes,
-- students/parents can view only published cards.
-- ================================================================

-- ── report_card_metadata ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage report_card_metadata"            ON public.report_card_metadata;
DROP POLICY IF EXISTS "Class instructors can manage report_card_metadata" ON public.report_card_metadata;
DROP POLICY IF EXISTS "Students can view own published report card"       ON public.report_card_metadata;
DROP POLICY IF EXISTS "Parents can view children published report cards"  ON public.report_card_metadata;

CREATE POLICY "Admins can manage report_card_metadata"
  ON public.report_card_metadata FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Class instructors can manage report_card_metadata"
  ON public.report_card_metadata FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = report_card_metadata.class_id
      )
      OR EXISTS (
        SELECT 1 FROM public.instructor_classes ic
        WHERE ic.instructor_id = auth.uid()
          AND ic.class_id = report_card_metadata.class_id
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND (
      EXISTS (
        SELECT 1 FROM public.class_instructors ci
        WHERE ci.instructor_id = auth.uid()
          AND ci.class_id = report_card_metadata.class_id
      )
      OR EXISTS (
        SELECT 1 FROM public.instructor_classes ic
        WHERE ic.instructor_id = auth.uid()
          AND ic.class_id = report_card_metadata.class_id
      )
    )
  );

CREATE POLICY "Students can view own published report card"
  ON public.report_card_metadata FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    AND is_published = true
  );

CREATE POLICY "Parents can view children published report cards"
  ON public.report_card_metadata FOR SELECT TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = report_card_metadata.student_id
    )
  );

-- ── psychomotor_ratings ──────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage psychomotor_ratings"            ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Class instructors can manage psychomotor_ratings" ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Students can view own psychomotor_ratings"        ON public.psychomotor_ratings;
DROP POLICY IF EXISTS "Parents can view children psychomotor_ratings"    ON public.psychomotor_ratings;

CREATE POLICY "Admins can manage psychomotor_ratings"
  ON public.psychomotor_ratings FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Class instructors can manage psychomotor_ratings"
  ON public.psychomotor_ratings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.report_card_metadata rcm
      WHERE rcm.student_id = psychomotor_ratings.student_id
        AND rcm.term_id    = psychomotor_ratings.term_id
        AND (
          EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
          OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id)
        )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.report_card_metadata rcm
      WHERE rcm.student_id = psychomotor_ratings.student_id
        AND rcm.term_id    = psychomotor_ratings.term_id
        AND (
          EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
          OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id)
        )
    )
  );

CREATE POLICY "Students can view own psychomotor_ratings"
  ON public.psychomotor_ratings FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Parents can view children psychomotor_ratings"
  ON public.psychomotor_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = psychomotor_ratings.student_id
    )
  );

-- ── affective_ratings ────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage affective_ratings"            ON public.affective_ratings;
DROP POLICY IF EXISTS "Class instructors can manage affective_ratings" ON public.affective_ratings;
DROP POLICY IF EXISTS "Students can view own affective_ratings"        ON public.affective_ratings;
DROP POLICY IF EXISTS "Parents can view children affective_ratings"    ON public.affective_ratings;

CREATE POLICY "Admins can manage affective_ratings"
  ON public.affective_ratings FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Class instructors can manage affective_ratings"
  ON public.affective_ratings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.report_card_metadata rcm
      WHERE rcm.student_id = affective_ratings.student_id
        AND rcm.term_id    = affective_ratings.term_id
        AND (
          EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
          OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id)
        )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'instructor'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.report_card_metadata rcm
      WHERE rcm.student_id = affective_ratings.student_id
        AND rcm.term_id    = affective_ratings.term_id
        AND (
          EXISTS (SELECT 1 FROM public.class_instructors ci WHERE ci.instructor_id = auth.uid() AND ci.class_id = rcm.class_id)
          OR EXISTS (SELECT 1 FROM public.instructor_classes ic WHERE ic.instructor_id = auth.uid() AND ic.class_id = rcm.class_id)
        )
    )
  );

CREATE POLICY "Students can view own affective_ratings"
  ON public.affective_ratings FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Parents can view children affective_ratings"
  ON public.affective_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = affective_ratings.student_id
    )
  );
