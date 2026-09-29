-- Instructors with can_view_results can see exam_attempts for students in their assigned classes
-- DROP IF EXISTS added: without it, re-running crashes with "policy already exists".
DROP POLICY IF EXISTS "Instructors can view assigned class attempts" ON public.exam_attempts;
CREATE POLICY "Instructors can view assigned class attempts"
ON public.exam_attempts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.instructor_permissions ip
    JOIN public.instructor_classes ic ON ic.instructor_id = ip.instructor_id
    JOIN public.profiles p ON p.class_id = ic.class_id
    WHERE ip.instructor_id = auth.uid()
      AND ip.can_view_results = true
      AND p.user_id = exam_attempts.student_id
  )
);

-- Instructors with can_view_results can see student_answers for students in their assigned classes
DROP POLICY IF EXISTS "Instructors can view assigned class answers" ON public.student_answers;
CREATE POLICY "Instructors can view assigned class answers"
ON public.student_answers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    JOIN public.profiles p ON p.user_id = ea.student_id
    JOIN public.instructor_classes ic ON ic.class_id = p.class_id
    JOIN public.instructor_permissions ip ON ip.instructor_id = ic.instructor_id
    WHERE ea.id = student_answers.attempt_id
      AND ip.instructor_id = auth.uid()
      AND ip.can_view_results = true
  )
);
