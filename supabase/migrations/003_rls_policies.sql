-- 003_rls_policies.sql
-- Row Level Security policies for Supabase JWT-based auth

-- Enable RLS on sensitive tables
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.engagement_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow clean re-run
DROP POLICY IF EXISTS users_admin_manage ON public.users;

DROP POLICY IF EXISTS students_select_own_or_staff ON public.students;
DROP POLICY IF EXISTS students_insert_staff_only ON public.students;
DROP POLICY IF EXISTS students_update_staff_only ON public.students;

DROP POLICY IF EXISTS assignment_submissions_select_own_or_staff ON public.assignment_submissions;
DROP POLICY IF EXISTS assignment_submissions_insert_student_own ON public.assignment_submissions;
DROP POLICY IF EXISTS assignment_submissions_update_student_own_or_staff ON public.assignment_submissions;

DROP POLICY IF EXISTS quiz_results_select_own_or_staff ON public.quiz_results;
DROP POLICY IF EXISTS quiz_results_insert_staff_only ON public.quiz_results;
DROP POLICY IF EXISTS quiz_results_update_staff_only ON public.quiz_results;

DROP POLICY IF EXISTS engagement_select_own_or_staff ON public.engagement_metrics;
DROP POLICY IF EXISTS engagement_insert_staff_only ON public.engagement_metrics;
DROP POLICY IF EXISTS engagement_update_staff_only ON public.engagement_metrics;

DROP POLICY IF EXISTS interventions_admin_manage ON public.interventions;
DROP POLICY IF EXISTS interventions_select_student_own ON public.interventions;

DROP POLICY IF EXISTS sync_logs_admin_only ON public.sync_logs;
DROP POLICY IF EXISTS sync_files_admin_only ON public.sync_files;

DROP POLICY IF EXISTS recommendations_select_own_or_staff ON public.recommendations;
DROP POLICY IF EXISTS recommendations_insert_staff_only ON public.recommendations;
DROP POLICY IF EXISTS recommendations_update_staff_only ON public.recommendations;
DROP POLICY IF EXISTS recommendations_delete_staff_only ON public.recommendations;

-- USERS: admin/ops only management
CREATE POLICY users_admin_manage ON public.users FOR ALL
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

-- STUDENTS
CREATE POLICY students_select_own_or_staff ON public.students FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = public.students.email
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY students_insert_staff_only ON public.students FOR INSERT
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY students_update_staff_only ON public.students FOR UPDATE
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

-- ASSIGNMENT SUBMISSIONS
CREATE POLICY assignment_submissions_select_own_or_staff ON public.assignment_submissions FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.assignment_submissions.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY assignment_submissions_insert_student_own ON public.assignment_submissions FOR INSERT
  WITH CHECK (
    (current_setting('jwt.claims.role', true) = 'student' AND current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.assignment_submissions.student_id))
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY assignment_submissions_update_student_own_or_staff ON public.assignment_submissions FOR UPDATE
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.assignment_submissions.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  )
  WITH CHECK (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.assignment_submissions.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

-- QUIZ RESULTS
CREATE POLICY quiz_results_select_own_or_staff ON public.quiz_results FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.quiz_results.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY quiz_results_insert_staff_only ON public.quiz_results FOR INSERT
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY quiz_results_update_staff_only ON public.quiz_results FOR UPDATE
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

-- ENGAGEMENT METRICS
CREATE POLICY engagement_select_own_or_staff ON public.engagement_metrics FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.engagement_metrics.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY engagement_insert_staff_only ON public.engagement_metrics FOR INSERT
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY engagement_update_staff_only ON public.engagement_metrics FOR UPDATE
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

-- INTERVENTIONS
CREATE POLICY interventions_admin_manage ON public.interventions FOR ALL
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY interventions_select_student_own ON public.interventions FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.interventions.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

-- SYNC_LOGS & SYNC_FILES: admins/ops only
CREATE POLICY sync_logs_admin_only ON public.sync_logs FOR ALL
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY sync_files_admin_only ON public.sync_files FOR ALL
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

-- RECOMMENDATIONS
CREATE POLICY recommendations_select_own_or_staff ON public.recommendations FOR SELECT
  USING (
    current_setting('jwt.claims.email', true) = (SELECT email FROM public.students WHERE public.students.id = public.recommendations.student_id)
    OR current_setting('jwt.claims.role', true) IN ('admin','ops')
  );

CREATE POLICY recommendations_insert_staff_only ON public.recommendations FOR INSERT
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY recommendations_update_staff_only ON public.recommendations FOR UPDATE
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'))
  WITH CHECK (current_setting('jwt.claims.role', true) IN ('admin','ops'));

CREATE POLICY recommendations_delete_staff_only ON public.recommendations FOR DELETE
  USING (current_setting('jwt.claims.role', true) IN ('admin','ops'));