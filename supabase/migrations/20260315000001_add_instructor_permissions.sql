-- Add 5 new permission columns to instructor_permissions
ALTER TABLE public.instructor_permissions
  ADD COLUMN IF NOT EXISTS can_mark_attendance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_grades boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_timetable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_fees boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_post_announcements boolean NOT NULL DEFAULT false;

-- Allow instructors to access attendance for their assigned classes
DROP POLICY IF EXISTS "Instructors can manage attendance for own school classes" ON public.attendance;
CREATE POLICY "Instructors can manage attendance for own school classes"
  ON public.attendance FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_mark_attendance = true
        AND ic.class_id = attendance.class_id
    )
  );

-- Allow instructors to manage grades for their assigned classes
DROP POLICY IF EXISTS "Instructors can manage grades for own school classes" ON public.grades;
CREATE POLICY "Instructors can manage grades for own school classes"
  ON public.grades FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
        AND ic.class_id = grades.class_id
    )
  );

-- Allow instructors with timetable permission to read periods
DROP POLICY IF EXISTS "Instructors can read school timetable periods" ON public.timetable_periods;
CREATE POLICY "Instructors can read school timetable periods"
  ON public.timetable_periods FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_timetable = true
    )
  );

-- Allow instructors with timetable permission to read entries
DROP POLICY IF EXISTS "Instructors can read school timetable entries" ON public.timetable_entries;
CREATE POLICY "Instructors can read school timetable entries"
  ON public.timetable_entries FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_timetable = true
    )
  );

-- Allow instructors with fees permission to read fee types
DROP POLICY IF EXISTS "Instructors can read school fee types" ON public.fee_types;
CREATE POLICY "Instructors can read school fee types"
  ON public.fee_types FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_fees = true
    )
  );

-- Allow instructors with fees permission to manage payments
DROP POLICY IF EXISTS "Instructors can manage school fee payments" ON public.fee_payments;
CREATE POLICY "Instructors can manage school fee payments"
  ON public.fee_payments FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_fees = true
    )
  );

-- Allow instructors with announcements permission to manage announcements
DROP POLICY IF EXISTS "Instructors can manage school announcements" ON public.announcements;
CREATE POLICY "Instructors can manage school announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_post_announcements = true
    )
  );

-- Allow instructors with grades permission to read grade categories
DROP POLICY IF EXISTS "Instructors can read school grade categories" ON public.grade_categories;
CREATE POLICY "Instructors can read school grade categories"
  ON public.grade_categories FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      WHERE ip.instructor_id = auth.uid()
        AND ip.can_manage_grades = true
    )
  );

-- Allow instructors to read profiles of students in their assigned classes
DROP POLICY IF EXISTS "Instructors can read profiles for their classes" ON public.profiles;
CREATE POLICY "Instructors can read profiles for their classes"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.instructor_permissions ip
      JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
      WHERE ip.instructor_id = auth.uid()
        AND (ip.can_manage_grades = true OR ip.can_mark_attendance = true)
        AND ic.class_id = profiles.class_id
    )
  );
