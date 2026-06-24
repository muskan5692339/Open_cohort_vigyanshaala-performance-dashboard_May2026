-- Phase 3: extend sync_runs and upload_versions for orchestration tracking

ALTER TABLE public.sync_runs
  ADD COLUMN IF NOT EXISTS upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'onedrive',
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS rows_processed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_changed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS insights jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS health_score text;

ALTER TABLE public.upload_versions
  ADD COLUMN IF NOT EXISTS sync_run_id uuid REFERENCES public.sync_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workbook_filename text;

CREATE INDEX IF NOT EXISTS idx_sync_runs_org_started ON public.sync_runs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_versions_sync_run ON public.upload_versions(sync_run_id);
