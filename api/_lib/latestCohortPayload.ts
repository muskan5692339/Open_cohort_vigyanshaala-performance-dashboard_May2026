import type { SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'zlib';

type UploadRow = { id: string; file_name: string; cohort_name: string };
type VersionRow = { payload_storage_path: string; payload_compressed: boolean | null };

async function loadLatestVersion(serviceDb: SupabaseClient, uploadId: string) {
  const { data: version, error: vErr } = await serviceDb
    .from('upload_versions')
    .select('payload_storage_path, payload_compressed, row_count')
    .eq('upload_id', uploadId)
    .not('payload_storage_path', 'is', null)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vErr) throw new Error(vErr.message);
  return version;
}

async function decodeStoredPayload(
  serviceDb: SupabaseClient,
  upload: UploadRow,
  version: VersionRow,
) {
  const { data: blob, error: sErr } = await serviceDb.storage
    .from('workbooks')
    .download(version.payload_storage_path);
  if (sErr || !blob) throw new Error(sErr?.message ?? 'Download failed');

  const buffer = Buffer.from(await blob.arrayBuffer());
  const compressed =
    Boolean(version.payload_compressed)
    || version.payload_storage_path.endsWith('.gz')
    || buffer[0] === 0x1f;
  const text = compressed ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');

  const stored = JSON.parse(text) as {
    headers: string[];
    rawRows: Record<string, string>[];
    mapping: Record<string, unknown>;
    discoveredColumns: unknown[];
    cohortName: string;
    fileName: string;
  };

  if (!stored.rawRows?.length) return null;

  return {
    payload: {
      cohortName: stored.cohortName ?? upload.cohort_name ?? 'Cohort',
      fileName: stored.fileName ?? upload.file_name ?? 'workbook.xlsx',
      students: [],
      attendance: [],
      assignments: [],
      quiz: [],
      rawRows: stored.rawRows,
      headers: stored.headers ?? [],
      discoveredColumns: stored.discoveredColumns,
      mapping: stored.mapping ?? {},
    },
    meta: {
      fileName: stored.fileName ?? upload.file_name ?? 'workbook.xlsx',
      cohortName: stored.cohortName ?? upload.cohort_name ?? 'Cohort',
      loadedAt: new Date().toISOString(),
      studentCount: stored.rawRows.length,
      source: 'cloud' as const,
    },
  };
}

async function fetchLatestActiveUpload(
  serviceDb: SupabaseClient,
  orgId?: string,
): Promise<UploadRow | null> {
  let query = serviceDb
    .from('uploads')
    .select('id, file_name, cohort_name')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }

  const { data: upload, error: uploadErr } = await query.maybeSingle();
  if (uploadErr) throw new Error(uploadErr.message);
  return upload;
}

export async function fetchLatestCohortPayloadForOrg(serviceDb: SupabaseClient, orgId: string) {
  const upload = await fetchLatestActiveUpload(serviceDb, orgId);
  if (!upload) return null;

  const version = await loadLatestVersion(serviceDb, upload.id);
  if (!version?.payload_storage_path) return null;

  return decodeStoredPayload(serviceDb, upload, version);
}

/** Single-tenant fallback when org id on student devices does not match admin upload. */
export async function fetchLatestCohortPayloadAny(serviceDb: SupabaseClient) {
  const upload = await fetchLatestActiveUpload(serviceDb);
  if (!upload) return null;

  const version = await loadLatestVersion(serviceDb, upload.id);
  if (!version?.payload_storage_path) return null;

  return decodeStoredPayload(serviceDb, upload, version);
}
