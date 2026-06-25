-- Public read-only bucket for student roster bootstrap (phones / no auth).
-- Written by api/persist-upload when admin clicks Apply Mapping.

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-roster-public', 'student-roster-public', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS student_roster_public_select ON storage.objects;
CREATE POLICY student_roster_public_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'student-roster-public');
