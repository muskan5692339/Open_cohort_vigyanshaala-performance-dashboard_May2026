-- 002_views_matviews.sql
-- Views and Materialized Views for VigyanShaala Performance Dashboard

-- ============================================================
-- Drop existing objects cleanly using DO block
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'student_performance_summary') THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.student_performance_summary CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'student_performance_summary') THEN
    EXECUTE 'DROP VIEW public.student_performance_summary CASCADE';
  END IF;
END $$;

DROP VIEW IF EXISTS public.cohort_summary CASCADE;
DROP VIEW IF EXISTS public.college_summary CASCADE;
DROP VIEW IF EXISTS public.at_risk_students CASCADE;
DROP VIEW IF EXISTS public.attendance_summary CASCADE;
DROP VIEW IF EXISTS public.assignment_summary CASCADE;

-- ============================================================
-- 1. STUDENT PERFORMANCE SUMMARY (Materialized View)
-- ============================================================
CREATE MATERIALIZED VIEW public.student_performance_summary AS
SELECT
  s.id AS student_pk,
  s.student_id,
  s.name,
  s.email,
  s.status,
  s.college_id,
  s.current_program_id,
  s.current_cohort_id,
  s.state,

  -- Attendance
  COALESCE(att.total_sessions, 0) AS total_sessions,
  COALESCE(att.attended_sessions, 0) AS attended_sessions,
  COALESCE(att.attendance_percentage, 0) AS attendance_percentage,

  -- Assignments
  COALESCE(asn.total_assignments, 0) AS total_assignments,
  COALESCE(asn.submitted_assignments, 0) AS submitted_assignments,
  COALESCE(asn.assignment_completion_pct, 0) AS assignment_completion_pct,

  -- Quizzes
  COALESCE(qz.total_quizzes, 0) AS total_quizzes,
  COALESCE(qz.attempted_quizzes, 0) AS attempted_quizzes,
  COALESCE(qz.average_quiz_score, 0) AS average_quiz_score,

  -- Engagement Score (weighted)
  ROUND(
    (COALESCE(att.attendance_percentage, 0) * 0.40) +
    (COALESCE(asn.assignment_completion_pct, 0) * 0.30) +
    (COALESCE(qz.average_quiz_score, 0) * 0.30),
  2) AS engagement_score,

  -- Category
  CASE
    WHEN ROUND((COALESCE(att.attendance_percentage,0)*0.40)+(COALESCE(asn.assignment_completion_pct,0)*0.30)+(COALESCE(qz.average_quiz_score,0)*0.30),2) >= 90 THEN 'Excellent'
    WHEN ROUND((COALESCE(att.attendance_percentage,0)*0.40)+(COALESCE(asn.assignment_completion_pct,0)*0.30)+(COALESCE(qz.average_quiz_score,0)*0.30),2) >= 75 THEN 'Good'
    WHEN ROUND((COALESCE(att.attendance_percentage,0)*0.40)+(COALESCE(asn.assignment_completion_pct,0)*0.30)+(COALESCE(qz.average_quiz_score,0)*0.30),2) >= 60 THEN 'Needs Attention'
    ELSE 'At Risk'
  END AS category,

  now() AS last_calculated_at

FROM public.students s

LEFT JOIN (
  SELECT
    ar.student_id,
    COUNT(*) AS total_sessions,
    SUM(CASE WHEN ar.attended THEN 1 ELSE 0 END) AS attended_sessions,
    ROUND(100.0 * SUM(CASE WHEN ar.attended THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS attendance_percentage
  FROM public.attendance_records ar
  GROUP BY ar.student_id
) att ON att.student_id = s.id

LEFT JOIN (
  SELECT
    sub.student_id,
    COUNT(*) AS total_assignments,
    SUM(CASE WHEN sub.status IN ('Submitted','Late Submission') THEN 1 ELSE 0 END) AS submitted_assignments,
    ROUND(100.0 * SUM(CASE WHEN sub.status IN ('Submitted','Late Submission') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS assignment_completion_pct
  FROM public.assignment_submissions sub
  GROUP BY sub.student_id
) asn ON asn.student_id = s.id

LEFT JOIN (
  SELECT
    qr.student_id,
    COUNT(*) AS total_quizzes,
    COUNT(*) AS attempted_quizzes,
    ROUND(AVG(qr.percentage), 2) AS average_quiz_score
  FROM public.quiz_results qr
  GROUP BY qr.student_id
) qz ON qz.student_id = s.id
WITH DATA;

-- Indexes on materialized view
CREATE UNIQUE INDEX idx_sps_student_pk ON public.student_performance_summary(student_pk);
CREATE INDEX idx_sps_cohort ON public.student_performance_summary(current_cohort_id);
CREATE INDEX idx_sps_college ON public.student_performance_summary(college_id);
CREATE INDEX idx_sps_category ON public.student_performance_summary(category);
CREATE INDEX idx_sps_engagement ON public.student_performance_summary(engagement_score DESC);


-- ============================================================
-- 2. COHORT SUMMARY VIEW
-- ============================================================
CREATE VIEW public.cohort_summary AS
SELECT
  c.id AS cohort_id,
  c.name AS cohort_name,
  c.start_date,
  c.end_date,
  p.id AS program_id,
  p.name AS program_name,
  col.id AS college_id,
  col.name AS college_name,
  COUNT(DISTINCT s.id) AS total_students,
  ROUND(AVG(sps.attendance_percentage), 2) AS avg_attendance,
  ROUND(AVG(sps.assignment_completion_pct), 2) AS avg_assignment_completion,
  ROUND(AVG(sps.average_quiz_score), 2) AS avg_quiz_score,
  ROUND(AVG(sps.engagement_score), 2) AS avg_engagement_score,
  SUM(CASE WHEN sps.category = 'Excellent' THEN 1 ELSE 0 END) AS excellent_count,
  SUM(CASE WHEN sps.category = 'Good' THEN 1 ELSE 0 END) AS good_count,
  SUM(CASE WHEN sps.category = 'Needs Attention' THEN 1 ELSE 0 END) AS needs_attention_count,
  SUM(CASE WHEN sps.category = 'At Risk' THEN 1 ELSE 0 END) AS at_risk_count
FROM public.cohorts c
LEFT JOIN public.programs p ON p.id = c.program_id
LEFT JOIN public.colleges col ON col.id = p.college_id
LEFT JOIN public.students s ON s.current_cohort_id = c.id
LEFT JOIN public.student_performance_summary sps ON sps.student_pk = s.id
GROUP BY c.id, c.name, c.start_date, c.end_date, p.id, p.name, col.id, col.name;


-- ============================================================
-- 3. COLLEGE SUMMARY VIEW
-- ============================================================
CREATE VIEW public.college_summary AS
SELECT
  col.id AS college_id,
  col.name AS college_name,
  col.state,
  COUNT(DISTINCT s.id) AS total_students,
  COUNT(DISTINCT c.id) AS total_cohorts,
  ROUND(AVG(sps.attendance_percentage), 2) AS avg_attendance,
  ROUND(AVG(sps.assignment_completion_pct), 2) AS avg_assignment_completion,
  ROUND(AVG(sps.average_quiz_score), 2) AS avg_quiz_score,
  ROUND(AVG(sps.engagement_score), 2) AS avg_engagement_score,
  SUM(CASE WHEN sps.category = 'At Risk' THEN 1 ELSE 0 END) AS at_risk_count
FROM public.colleges col
LEFT JOIN public.students s ON s.college_id = col.id
LEFT JOIN public.cohorts c ON c.id = s.current_cohort_id
LEFT JOIN public.student_performance_summary sps ON sps.student_pk = s.id
GROUP BY col.id, col.name, col.state;


-- ============================================================
-- 4. AT-RISK STUDENTS VIEW
-- ============================================================
CREATE VIEW public.at_risk_students AS
SELECT
  sps.student_pk,
  sps.student_id,
  sps.name,
  sps.email,
  sps.state,
  sps.current_cohort_id,
  sps.current_program_id,
  sps.college_id,
  sps.attendance_percentage,
  sps.assignment_completion_pct,
  sps.average_quiz_score,
  sps.engagement_score,
  sps.category,
  i.action_taken AS last_intervention,
  i.created_at AS last_intervention_date
FROM public.student_performance_summary sps
LEFT JOIN LATERAL (
  SELECT action_taken, created_at
  FROM public.interventions
  WHERE student_id = sps.student_pk
  ORDER BY created_at DESC
  LIMIT 1
) i ON true
WHERE sps.engagement_score < 60;


-- ============================================================
-- 5. ATTENDANCE SUMMARY VIEW
-- ============================================================
CREATE VIEW public.attendance_summary AS
SELECT
  s.id AS student_pk,
  s.student_id,
  s.name,
  s.current_cohort_id,
  COUNT(ar.id) AS total_sessions,
  SUM(CASE WHEN ar.attended THEN 1 ELSE 0 END) AS attended_sessions,
  ROUND(100.0 * SUM(CASE WHEN ar.attended THEN 1 ELSE 0 END) / NULLIF(COUNT(ar.id), 0), 2) AS attendance_percentage
FROM public.students s
LEFT JOIN public.attendance_records ar ON ar.student_id = s.id
GROUP BY s.id, s.student_id, s.name, s.current_cohort_id;


-- ============================================================
-- 6. ASSIGNMENT SUMMARY VIEW
-- ============================================================
CREATE VIEW public.assignment_summary AS
SELECT
  s.id AS student_pk,
  s.student_id,
  s.name,
  s.current_cohort_id,
  COUNT(sub.id) AS total_assignments,
  SUM(CASE WHEN sub.status IN ('Submitted','Late Submission') THEN 1 ELSE 0 END) AS completed_assignments,
  SUM(CASE WHEN sub.status = 'Pending' THEN 1 ELSE 0 END) AS pending_assignments,
  SUM(CASE WHEN sub.status = 'Late Submission' THEN 1 ELSE 0 END) AS late_submissions,
  ROUND(100.0 * SUM(CASE WHEN sub.status IN ('Submitted','Late Submission') THEN 1 ELSE 0 END) / NULLIF(COUNT(sub.id), 0), 2) AS completion_percentage
FROM public.students s
LEFT JOIN public.assignment_submissions sub ON sub.student_id = s.id
GROUP BY s.id, s.student_id, s.name, s.current_cohort_id;


-- ============================================================
-- 7. REFRESH FUNCTION for materialized view
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_performance_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.student_performance_summary;
END;
$$ LANGUAGE plpgsql;
