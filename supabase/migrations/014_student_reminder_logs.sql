-- Weekly student reminder email log (dedupe one email per student per ISO week)
create table if not exists public.student_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  student_email text not null,
  student_name text,
  cohort_name text,
  week_key text not null,
  reasons text[] not null default '{}',
  attendance_pct numeric,
  assignment_pct numeric,
  avg_quiz numeric,
  sent_at timestamptz not null default now(),
  unique (student_email, week_key)
);

create index if not exists student_reminder_logs_week_idx
  on public.student_reminder_logs (week_key desc);

alter table public.student_reminder_logs enable row level security;
