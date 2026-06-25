import type { SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'zlib';

export async function fetchLatestCohortPayloadForOrg(serviceDb: SupabaseClient, orgId: string) {
  const { data: upload, error: uploadErr } = await serviceDb
    .from('uploads')
    .select('id, file_name, cohort_name')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (uploadErr) throw new Error(uploadErr.message);
  if (!upload) return null;

  const { data: version, error: vErr } = await serviceDb
    .from('upload_versions')
    .select('payload_storage_path, payload_compressed, row_count')
    .eq('upload_id', upload.id)
    .not('payload_storage_path', 'is', null)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vErr) throw new Error(vErr.message);
  if (!version?.payload_storage_path) return null;

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
