-- Run in Supabase → SQL Editor AFTER you already have Auth users.
-- If organization_members does not exist, run migration files 006–012 first
-- (see instructions in DEPLOYMENT.md), then run THIS script.

-- 1) Ensure profile rows exist for Auth users (users created before migration 006)
INSERT INTO public.profiles (id, email, display_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, updated_at = now();

-- 2) Grant admin role for VigyanShaala org
INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
SELECT
  '00000000-0000-4000-8000-000000000010'::uuid,
  p.id,
  'admin',
  true
FROM public.profiles p
WHERE p.email IN (
  'muskan.gupta@vigyanshaala.com',
  'vigyanshaala.tech@gmail.com'
)
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = 'admin', is_active = true, updated_at = now();

-- 3) Verify
SELECT p.email, om.role, om.is_active
FROM public.organization_members om
JOIN public.profiles p ON p.id = om.user_id
WHERE p.email IN (
  'muskan.gupta@vigyanshaala.com',
  'vigyanshaala.tech@gmail.com'
);
