-- Let signed-in admins upload the public student roster (bypasses large Vercel API body limits).

DROP POLICY IF EXISTS student_roster_public_insert_admin ON storage.objects;
CREATE POLICY student_roster_public_insert_admin ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-roster-public'
    AND public.user_has_org_role(
      (storage.foldername(name))[1]::uuid,
      ARRAY['admin']
    )
  );

DROP POLICY IF EXISTS student_roster_public_update_admin ON storage.objects;
CREATE POLICY student_roster_public_update_admin ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-roster-public'
    AND public.user_has_org_role(
      (storage.foldername(name))[1]::uuid,
      ARRAY['admin']
    )
  );

-- Root fallback file (single-tenant) — any active admin may write latest.json.gz
DROP POLICY IF EXISTS student_roster_public_insert_root ON storage.objects;
CREATE POLICY student_roster_public_insert_root ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-roster-public'
    AND name = 'latest.json.gz'
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS student_roster_public_update_root ON storage.objects;
CREATE POLICY student_roster_public_update_root ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-roster-public'
    AND name = 'latest.json.gz'
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role = 'admin'
    )
  );
