-- Phase 4: workbook compression metadata + restore tracking

ALTER TABLE public.upload_versions
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS payload_compressed boolean NOT NULL DEFAULT false;

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS restored_from_version_id uuid REFERENCES public.upload_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_upload_versions_content_hash
  ON public.upload_versions(upload_id, content_hash)
  WHERE content_hash IS NOT NULL;
