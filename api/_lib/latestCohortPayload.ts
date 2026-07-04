import type { SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'zlib';

type UploadRow = { id: string; file_name: string; cohort_name: string };
type VersionRow = { payload_storage_path: string; payload_compressed: boolean | null };

const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000010';

function parseStoredJson(stored: {
  headers?: string[];
  rawRows?: Record<string, string>[];
  mapping?: Record<string, unknown>;
  discoveredColumns?: unknown[];
  classWiseAttendance?: unknown[];
  classWiseAttendanceColumns?: string[];
  cohortName?: string;
  fileName?: string;
}, fallback: { fileName: string; cohortName: string }) {
  if (!stored.rawRows?.length) return null;
  const classWiseAttendance = stored.classWiseAttendance ?? [];
  return {
    payload: {
      cohortName: stored.cohortName ?? fallback.cohortName,
      fileName: stored.fileName ?? fallback.fileName,
      students: [],
      attendance: [],
      assignments: [],
      quiz: [],
      rawRows: stored.rawRows,
      headers: stored.headers ?? [],
      discoveredColumns: stored.discoveredColumns,
      mapping: stored.mapping ?? {},
      classWiseAttendance: classWiseAttendance.length ? classWiseAttendance : undefined,
      classWiseAttendanceColumns: stored.classWiseAttendanceColumns,
    },
    meta: {
      fileName: stored.fileName ?? fallback.fileName,
      cohortName: stored.cohortName ?? fallback.cohortName,
      loadedAt: new Date().toISOString(),
      studentCount: stored.rawRows.length,
      classWiseStudentCount: classWiseAttendance.length || undefined,
      source: 'cloud' as const,
    },
  };
}

async function decodeBufferPayload(buffer: Buffer, fallback: { fileName: string; cohortName: string }) {
  const compressed = buffer[0] === 0x1f;
  const text = compressed ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  const stored = JSON.parse(text) as Parameters<typeof parseStoredJson>[0];
  return parseStoredJson(stored, fallback);
}

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
  return decodeBufferPayload(buffer, {
    fileName: upload.file_name ?? 'workbook.xlsx',
    cohortName: upload.cohort_name ?? 'Cohort',
  });
}

/** Data Source uploads go here (same path student-view reads). */
async function fetchFromPublicRosterStorage(serviceDb: SupabaseClient, orgId?: string) {
  const org = orgId ?? process.env.VITE_DEFAULT_ORG_ID?.trim() ?? DEFAULT_ORG_ID;
  const paths = [`${org}/latest.json.gz`, 'latest.json.gz'];

  for (const path of paths) {
    const { data: blob, error } = await serviceDb.storage.from('student-roster-public').download(path);
    if (error || !blob) continue;
    const parsed = await decodeBufferPayload(Buffer.from(await blob.arrayBuffer()), {
      fileName: 'workbook.xlsx',
      cohortName: 'Cohort',
    });
    if (parsed) return parsed;
  }
  return null;
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
  if (upload) {
    const version = await loadLatestVersion(serviceDb, upload.id);
    if (version?.payload_storage_path) {
      const fromWorkbooks = await decodeStoredPayload(serviceDb, upload, version);
      if (fromWorkbooks) return fromWorkbooks;
    }
  }
  return fetchFromPublicRosterStorage(serviceDb, orgId);
}

/** Single-tenant fallback when org id on student devices does not match admin upload. */
export async function fetchLatestCohortPayloadAny(serviceDb: SupabaseClient) {
  const upload = await fetchLatestActiveUpload(serviceDb);
  if (upload) {
    const version = await loadLatestVersion(serviceDb, upload.id);
    if (version?.payload_storage_path) {
      const fromWorkbooks = await decodeStoredPayload(serviceDb, upload, version);
      if (fromWorkbooks) return fromWorkbooks;
    }
  }
  return fetchFromPublicRosterStorage(serviceDb);
}
