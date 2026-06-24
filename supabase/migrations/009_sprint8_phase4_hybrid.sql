-- Phase 4: hybrid entity cache for org-scoped local→cloud sync batches

CREATE TABLE IF NOT EXISTS public.hybrid_sync_cache (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_type)
);

ALTER TABLE public.hybrid_sync_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hybrid_cache_select ON public.hybrid_sync_cache;
CREATE POLICY hybrid_cache_select ON public.hybrid_sync_cache
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS hybrid_cache_write ON public.hybrid_sync_cache;
CREATE POLICY hybrid_cache_write ON public.hybrid_sync_cache
  FOR ALL USING (
    organization_id IN (SELECT public.user_org_ids())
    AND public.user_has_org_role(organization_id, ARRAY['admin', 'program_manager'])
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
  );
