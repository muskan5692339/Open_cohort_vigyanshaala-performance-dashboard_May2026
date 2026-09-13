-- Optional future table for profile corrections.
-- The live API currently stores requests in Storage:
--   student-roster-public/{orgId}/profile-corrections.json
-- Keep this migration for a later SQL-backed upgrade if needed.

create table if not exists public.student_profile_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_email text not null,
  student_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  fields jsonb not null default '{}'::jsonb,
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists student_profile_corrections_org_status_idx
  on public.student_profile_corrections (organization_id, status, submitted_at desc);

alter table public.student_profile_corrections enable row level security;
