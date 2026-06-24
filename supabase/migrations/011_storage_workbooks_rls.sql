-- Storage RLS: workbooks bucket scoped by organization folder
-- Path pattern: workbooks/<organization_id>/<upload_id>/vN.json.gz
-- Service role (API routes) bypasses storage RLS; these policies protect direct client access.

INSERT INTO storage.buckets (id, name, public)
VALUES ('workbooks', 'workbooks', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS workbooks_select_org ON storage.objects;
CREATE POLICY workbooks_select_org ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workbooks'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_org_ids())
  );

DROP POLICY IF EXISTS workbooks_insert_org ON storage.objects;
CREATE POLICY workbooks_insert_org ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workbooks'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_org_ids())
    AND public.user_has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
  );

DROP POLICY IF EXISTS workbooks_update_org ON storage.objects;
CREATE POLICY workbooks_update_org ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workbooks'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_org_ids())
    AND public.user_has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
  );
