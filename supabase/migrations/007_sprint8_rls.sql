-- Sprint 8 RLS: organization-scoped access via organization_members

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_has_org_role(p_org_id uuid, p_roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role = ANY(p_roles)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organizations: members can read their orgs
DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations
  FOR SELECT USING (id IN (SELECT public.user_org_ids()));

-- Profiles: users read/update own profile
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Members: see members in same org
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
CREATE POLICY org_members_select ON public.organization_members
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

-- Uploads
DROP POLICY IF EXISTS uploads_select ON public.uploads;
CREATE POLICY uploads_select ON public.uploads
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS uploads_insert ON public.uploads;
CREATE POLICY uploads_insert ON public.uploads
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin'])
  );

DROP POLICY IF EXISTS uploads_update ON public.uploads;
CREATE POLICY uploads_update ON public.uploads
  FOR UPDATE USING (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin'])
  );

-- Upload versions (read all org members; insert admin)
DROP POLICY IF EXISTS upload_versions_select ON public.upload_versions;
CREATE POLICY upload_versions_select ON public.upload_versions
  FOR SELECT USING (
    upload_id IN (
      SELECT id FROM public.uploads WHERE organization_id IN (SELECT public.user_org_ids())
    )
  );

DROP POLICY IF EXISTS upload_versions_insert ON public.upload_versions;
CREATE POLICY upload_versions_insert ON public.upload_versions
  FOR INSERT WITH CHECK (
    upload_id IN (
      SELECT id FROM public.uploads u
      WHERE u.organization_id IN (SELECT public.user_org_ids())
        AND public.user_has_org_role(u.organization_id, ARRAY['admin'])
    )
  );

-- Schema profiles
DROP POLICY IF EXISTS schema_profiles_select ON public.schema_profiles;
CREATE POLICY schema_profiles_select ON public.schema_profiles
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS schema_profiles_all_admin ON public.schema_profiles;
CREATE POLICY schema_profiles_all_admin ON public.schema_profiles
  FOR ALL USING (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin'])
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin'])
  );

-- Snapshots
DROP POLICY IF EXISTS upload_snapshots_select ON public.upload_snapshots;
CREATE POLICY upload_snapshots_select ON public.upload_snapshots
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS upload_snapshots_insert ON public.upload_snapshots;
CREATE POLICY upload_snapshots_insert ON public.upload_snapshots
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

-- Saved views
DROP POLICY IF EXISTS saved_views_select ON public.saved_views;
CREATE POLICY saved_views_select ON public.saved_views
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS saved_views_write ON public.saved_views;
CREATE POLICY saved_views_write ON public.saved_views
  FOR ALL USING (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin', 'program_manager'])
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin', 'program_manager'])
  );

-- Risk actions
DROP POLICY IF EXISTS risk_actions_select ON public.risk_actions;
CREATE POLICY risk_actions_select ON public.risk_actions
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS risk_actions_insert ON public.risk_actions;
CREATE POLICY risk_actions_insert ON public.risk_actions
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin', 'program_manager'])
  );

-- Audit logs (insert any member; read org)
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

-- Sync runs
DROP POLICY IF EXISTS sync_runs_select ON public.sync_runs;
CREATE POLICY sync_runs_select ON public.sync_runs
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS sync_runs_insert ON public.sync_runs;
CREATE POLICY sync_runs_insert ON public.sync_runs
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin'])
  );

-- Telemetry (insert authenticated; read admin)
DROP POLICY IF EXISTS telemetry_insert ON public.telemetry_events;
CREATE POLICY telemetry_insert ON public.telemetry_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS telemetry_select ON public.telemetry_events;
CREATE POLICY telemetry_select ON public.telemetry_events
  FOR SELECT USING (
    organization_id IS NULL
    OR (
      organization_id IN (SELECT public.user_org_ids())
      AND public.user_has_org_role(organization_id, ARRAY['admin'])
    )
  );
