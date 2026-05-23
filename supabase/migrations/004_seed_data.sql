-- 004_seed_data.sql
-- Seed data: 5 colleges, 3 programs, 6 cohorts, 100 students,
-- sessions, attendance, assignments, submissions, quizzes, quiz_results, interventions

BEGIN;

-- Colleges
INSERT INTO public.colleges (id, name, state)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid,'Government Engineering College Pune','Maharashtra'),
  ('11111111-1111-1111-1111-111111111112'::uuid,'National Institute of Technology Jaipur','Rajasthan'),
  ('11111111-1111-1111-1111-111111111113'::uuid,'Regional College of Engineering Trichy','Tamil Nadu'),
  ('11111111-1111-1111-1111-111111111114'::uuid,'State Polytechnic College Bhopal','Madhya Pradesh'),
  ('11111111-1111-1111-1111-111111111115'::uuid,'City Engineering College Ahmedabad','Gujarat')
ON CONFLICT DO NOTHING;

-- Programs
INSERT INTO public.programs (id, college_id, name)
VALUES
  ('22222222-2222-2222-2222-222222222221'::uuid,'11111111-1111-1111-1111-111111111111'::uuid,'Computer Science'),
  ('22222222-2222-2222-2222-222222222222'::uuid,'11111111-1111-1111-1111-111111111112'::uuid,'Mechanical Engineering'),
  ('22222222-2222-2222-2222-222222222223'::uuid,'11111111-1111-1111-1111-111111111113'::uuid,'Electrical Engineering')
ON CONFLICT DO NOTHING;

-- Cohorts
INSERT INTO public.cohorts (id, program_id, name, start_date, end_date)
VALUES
  ('33333333-3333-3333-3333-333333333331'::uuid,'22222222-2222-2222-2222-222222222221'::uuid,'Open Cohort A','2026-01-10','2026-06-30'),
  ('33333333-3333-3333-3333-333333333332'::uuid,'22222222-2222-2222-2222-222222222221'::uuid,'Open Cohort B','2026-02-01','2026-07-31'),
  ('33333333-3333-3333-3333-333333333333'::uuid,'22222222-2222-2222-2222-222222222222'::uuid,'Open Cohort C','2026-01-15','2026-06-30'),
  ('33333333-3333-3333-3333-333333333334'::uuid,'22222222-2222-2222-2222-222222222222'::uuid,'Open Cohort D','2026-03-01','2026-08-31'),
  ('33333333-3333-3333-3333-333333333335'::uuid,'22222222-2222-2222-2222-222222222223'::uuid,'Open Cohort E','2026-02-15','2026-07-31'),
  ('33333333-3333-3333-3333-333333333336'::uuid,'22222222-2222-2222-2222-222222222223'::uuid,'Open Cohort F','2026-03-15','2026-08-31')
ON CONFLICT DO NOTHING;

-- Generate 100 students
DO $$
DECLARE
  i int;
  sid uuid;
  cohort_ids uuid[] := ARRAY[
    '33333333-3333-3333-3333-333333333331'::uuid,
    '33333333-3333-3333-3333-333333333332'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    '33333333-3333-3333-3333-333333333334'::uuid,
    '33333333-3333-3333-3333-333333333335'::uuid,
    '33333333-3333-3333-3333-333333333336'::uuid
  ];
BEGIN
  FOR i IN 1..100 LOOP
    sid := gen_random_uuid();

    INSERT INTO public.students (id, student_id, name, email, college_id, state, current_program_id, current_cohort_id, enrollment_date, status, last_synced_at)
    VALUES (
      sid,
      'VS-2026-' || lpad(i::text, 3, '0'),
      'Student ' || i,
      'student' || lpad(i::text, 3, '0') || '@example.com',
      CASE WHEN (i % 5)=1 THEN '11111111-1111-1111-1111-111111111111'::uuid
           WHEN (i % 5)=2 THEN '11111111-1111-1111-1111-111111111112'::uuid
           WHEN (i % 5)=3 THEN '11111111-1111-1111-1111-111111111113'::uuid
           WHEN (i % 5)=4 THEN '11111111-1111-1111-1111-111111111114'::uuid
           ELSE                 '11111111-1111-1111-1111-111111111115'::uuid END,
      CASE WHEN (i % 7)=0 THEN 'Karnataka'
           WHEN (i % 7)=1 THEN 'Maharashtra'
           WHEN (i % 7)=2 THEN 'Rajasthan'
           WHEN (i % 7)=3 THEN 'Tamil Nadu'
           WHEN (i % 7)=4 THEN 'Gujarat'
           WHEN (i % 7)=5 THEN 'Bihar'
           ELSE 'Madhya Pradesh' END,
      CASE WHEN (i % 3)=1 THEN '22222222-2222-2222-2222-222222222221'::uuid
           WHEN (i % 3)=2 THEN '22222222-2222-2222-2222-222222222222'::uuid
           ELSE                 '22222222-2222-2222-2222-222222222223'::uuid END,
      cohort_ids[((i-1) % array_length(cohort_ids,1)) + 1],
      (date '2026-01-15' + ((i % 30) || ' days')::interval)::date,
      'Active',
      now()
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.enrollments (student_id, program_id, cohort_id, enrollment_date, status)
    VALUES (
      sid,
      CASE WHEN (i % 3)=1 THEN '22222222-2222-2222-2222-222222222221'::uuid
           WHEN (i % 3)=2 THEN '22222222-2222-2222-2222-222222222222'::uuid
           ELSE                 '22222222-2222-2222-2222-222222222223'::uuid END,
      cohort_ids[((i-1) % array_length(cohort_ids,1)) + 1],
      (date '2026-01-15' + ((i % 30) || ' days')::interval)::date,
      'Active'
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Sessions: 20 per cohort
DO $$
DECLARE
  c record;
  j int;
BEGIN
  FOR c IN SELECT id, start_date FROM public.cohorts LOOP
    FOR j IN 0..19 LOOP
      INSERT INTO public.sessions (cohort_id, session_date, duration_hours)
      VALUES (c.id, c.start_date + (j * INTERVAL '7 days'), 2.0)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Assignments: 5 per cohort
DO $$
DECLARE
  c record;
  k int;
BEGIN
  FOR c IN SELECT id, start_date FROM public.cohorts LOOP
    FOR k IN 1..5 LOOP
      INSERT INTO public.assignments (cohort_id, name, due_date)
      VALUES (c.id, 'Assignment ' || k, c.start_date + (k * INTERVAL '14 days'))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Quizzes: 5 per cohort
DO $$
DECLARE
  c record;
  k int;
BEGIN
  FOR c IN SELECT id, start_date FROM public.cohorts LOOP
    FOR k IN 1..5 LOOP
      INSERT INTO public.quizzes (cohort_id, name, date)
      VALUES (c.id, 'Quiz ' || k, c.start_date + (k * INTERVAL '21 days'))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Attendance records
DO $$
DECLARE
  s_rec record;
  sess_rec record;
BEGIN
  FOR sess_rec IN SELECT id, cohort_id, session_date, duration_hours FROM public.sessions LOOP
    FOR s_rec IN SELECT id FROM public.students WHERE current_cohort_id = sess_rec.cohort_id LOOP
      INSERT INTO public.attendance_records (student_id, session_id, hours_attended, attended, updated_at, created_at)
      VALUES (
        s_rec.id,
        sess_rec.id,
        CASE WHEN (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 80
             THEN sess_rec.duration_hours ELSE 0 END,
        CASE WHEN (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 80
             THEN true ELSE false END,
        now(), now()
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Assignment submissions
DO $$
DECLARE
  s_rec record;
  asg record;
BEGIN
  FOR asg IN SELECT id, cohort_id FROM public.assignments LOOP
    FOR s_rec IN SELECT id FROM public.students WHERE current_cohort_id = asg.cohort_id LOOP
      INSERT INTO public.assignment_submissions (assignment_id, student_id, status, submitted_at, created_at, updated_at)
      VALUES (
        asg.id,
        s_rec.id,
        CASE
          WHEN (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 70 THEN 'Submitted'
          WHEN (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 85 THEN 'Late Submission'
          ELSE 'Pending' END,
        CASE WHEN (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 85
             THEN now() - ((random()*30)::int * INTERVAL '1 day') ELSE NULL END,
        now(), now()
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Quiz results
DO $$
DECLARE
  s_rec record;
  qz record;
BEGIN
  FOR qz IN SELECT id, cohort_id FROM public.quizzes LOOP
    FOR s_rec IN SELECT id FROM public.students WHERE current_cohort_id = qz.cohort_id LOOP
      IF (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 100) < 80 THEN
        INSERT INTO public.quiz_results (quiz_id, student_id, score, percentage, taken_at, created_at, updated_at)
        VALUES (
          qz.id,
          s_rec.id,
          (50 + (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 51)),
          (50 + (abs((('x'||substr(md5(s_rec.id::text),1,16))::bit(64))::bigint) % 51)),
          now() - ((random()*30)::int * INTERVAL '1 day'), now(), now()
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Top performers: VS-2026-001..005
UPDATE public.students SET name = name || ' (Top)', status='Active'
WHERE student_id IN ('VS-2026-001','VS-2026-002','VS-2026-003','VS-2026-004','VS-2026-005');

INSERT INTO public.assignment_submissions (assignment_id, student_id, status, submitted_at, created_at, updated_at)
SELECT a.id, s.id, 'Submitted', now(), now(), now()
FROM public.assignments a
JOIN public.students s ON s.student_id IN ('VS-2026-001','VS-2026-002','VS-2026-003','VS-2026-004','VS-2026-005')
WHERE a.cohort_id = s.current_cohort_id
ON CONFLICT (assignment_id, student_id) DO UPDATE SET status='Submitted', submitted_at = EXCLUDED.submitted_at, updated_at = now();

INSERT INTO public.quiz_results (quiz_id, student_id, score, percentage, taken_at, created_at, updated_at)
SELECT q.id, s.id, 95, 95, now(), now(), now()
FROM public.quizzes q
JOIN public.students s ON s.student_id IN ('VS-2026-001','VS-2026-002','VS-2026-003','VS-2026-004','VS-2026-005')
WHERE q.cohort_id = s.current_cohort_id
ON CONFLICT (quiz_id, student_id) DO UPDATE SET score=95, percentage=95, taken_at = EXCLUDED.taken_at, updated_at = now();

-- Low attendance: VS-2026-006..010
UPDATE public.students SET name = name || ' (LowAttendance)'
WHERE student_id IN ('VS-2026-006','VS-2026-007','VS-2026-008','VS-2026-009','VS-2026-010');

DO $$
DECLARE srec record;
BEGIN
  FOR srec IN SELECT id FROM public.students
    WHERE student_id IN ('VS-2026-006','VS-2026-007','VS-2026-008','VS-2026-009','VS-2026-010') LOOP
    UPDATE public.attendance_records SET hours_attended = 0, attended = false WHERE student_id = srec.id;
  END LOOP;
END $$;

-- Assignment backlog: VS-2026-011..015
UPDATE public.students SET name = name || ' (Backlog)'
WHERE student_id IN ('VS-2026-011','VS-2026-012','VS-2026-013','VS-2026-014','VS-2026-015');

DO $$
DECLARE srec record; asg record;
BEGIN
  FOR srec IN SELECT id FROM public.students
    WHERE student_id IN ('VS-2026-011','VS-2026-012','VS-2026-013','VS-2026-014','VS-2026-015') LOOP
    FOR asg IN
      SELECT a.* FROM public.assignments a
      WHERE a.cohort_id = (SELECT current_cohort_id FROM public.students WHERE id = srec.id)
      LIMIT 5
    LOOP
      UPDATE public.assignment_submissions
      SET status = 'Pending', submitted_at = NULL
      WHERE assignment_id = asg.id AND student_id = srec.id;
    END LOOP;
  END LOOP;
END $$;

-- High-risk: VS-2026-016..020
UPDATE public.students SET name = name || ' (HighRisk)'
WHERE student_id IN ('VS-2026-016','VS-2026-017','VS-2026-018','VS-2026-019','VS-2026-020');

DO $$
DECLARE srec record;
BEGIN
  FOR srec IN SELECT id FROM public.students
    WHERE student_id IN ('VS-2026-016','VS-2026-017','VS-2026-018','VS-2026-019','VS-2026-020') LOOP
    UPDATE public.attendance_records SET hours_attended = 0, attended = false WHERE student_id = srec.id;
    UPDATE public.assignment_submissions SET status = 'Pending', submitted_at = NULL WHERE student_id = srec.id;
    DELETE FROM public.quiz_results WHERE student_id = srec.id;
  END LOOP;
END $$;

-- Interventions
INSERT INTO public.interventions (student_id, risk_category, action_taken, notes, followup_date, created_at, created_by)
SELECT s.id, 'High Risk', 'Called Student', 'Left voicemail; follow-up required', now()::date + 7, now(), NULL
FROM public.students s
WHERE s.student_id IN ('VS-2026-016','VS-2026-017');

-- Refresh materialized view to populate analytics
SELECT public.refresh_performance_summary();

-- Engagement metrics (after matview is populated)
INSERT INTO public.engagement_metrics (student_id, attendance_percentage, assignment_completion, quiz_performance, engagement_score, category, calculated_at, created_at, updated_at)
SELECT
  s.id,
  COALESCE(sp.attendance_percentage, 0),
  COALESCE(sp.assignment_completion_pct, 0),
  COALESCE(sp.average_quiz_score, 0),
  ROUND(
    (COALESCE(sp.attendance_percentage, 0) * 0.40) +
    (COALESCE(sp.assignment_completion_pct, 0) * 0.30) +
    (COALESCE(sp.average_quiz_score, 0) * 0.30), 2),
  CASE
    WHEN ROUND((COALESCE(sp.attendance_percentage,0)*0.40)+(COALESCE(sp.assignment_completion_pct,0)*0.30)+(COALESCE(sp.average_quiz_score,0)*0.30),2) >= 90 THEN 'Excellent'
    WHEN ROUND((COALESCE(sp.attendance_percentage,0)*0.40)+(COALESCE(sp.assignment_completion_pct,0)*0.30)+(COALESCE(sp.average_quiz_score,0)*0.30),2) >= 75 THEN 'Good'
    WHEN ROUND((COALESCE(sp.attendance_percentage,0)*0.40)+(COALESCE(sp.assignment_completion_pct,0)*0.30)+(COALESCE(sp.average_quiz_score,0)*0.30),2) >= 60 THEN 'Needs Attention'
    ELSE 'At Risk' END,
  now(), now(), now()
FROM public.students s
LEFT JOIN public.student_performance_summary sp ON sp.student_pk = s.id
ON CONFLICT (student_id, calculated_at) DO NOTHING;

COMMIT;
