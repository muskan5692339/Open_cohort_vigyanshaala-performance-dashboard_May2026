import type { PersistUploadPayload } from '../../types/cloudTypes';
import type { ParsedExcelPayload } from '../loadMetricsFromParsedExcel';
import type { ColumnMapping, DiscoveredColumn } from '../../types/dynamicSchema';
import { enqueueSyncItem, getActiveOrganizationId, isCloudPersistenceEnabled } from './cloudConfig';
import { publishRosterDirectToStorage } from './directRosterPublish';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');

async function gunzipJson(blob: Blob): Promise<unknown> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x1f) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return null;
}

type CohortFetchResult = {
  payload: ParsedExcelPayload;
  meta: { fileName: string; cohortName: string; loadedAt: string; studentCount: number };
};

function parseStoredCohort(stored: {
  headers?: string[];
  rawRows?: Record<string, string>[];
  mapping?: Record<string, unknown>;
  discoveredColumns?: unknown[];
  cohortName?: string;
  fileName?: string;
}): CohortFetchResult | null {
  if (!stored.rawRows?.length) return null;
  const fileName = stored.fileName ?? 'workbook.xlsx';
  const cohortName = stored.cohortName ?? 'Cohort';
  return {
    payload: {
      cohortName,
      fileName,
      students: [],
      attendance: [],
      assignments: [],
      quiz: [],
      rawRows: stored.rawRows,
      headers: stored.headers ?? [],
      discoveredColumns: stored.discoveredColumns as DiscoveredColumn[] | undefined,
      mapping: (stored.mapping ?? {}) as ColumnMapping,
    },
    meta: {
      fileName,
      cohortName,
      loadedAt: new Date().toISOString(),
      studentCount: stored.rawRows.length,
    },
  };
}

/** Direct public Supabase Storage read — works on student phones when API routes fail. */
async function fetchPublicCohortPayload(orgId: string): Promise<CohortFetchResult | null> {
  if (!SUPABASE_URL?.startsWith('http')) return null;

  const paths = [`${orgId}/latest.json.gz`, 'latest.json.gz'];
  for (const path of paths) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/storage/v1/object/public/student-roster-public/${path}`,
        { cache: 'no-store' },
      );
      if (!res.ok) continue;
      const parsed = await gunzipJson(await res.blob());
      if (!parsed || typeof parsed !== 'object') continue;
      const result = parseStoredCohort(parsed as Parameters<typeof parseStoredCohort>[0]);
      if (result) return result;
    } catch {
      // try next path
    }
  }
  return null;
}

export interface PersistUploadResult {
  ok: boolean;
  uploadId?: string;
  versionId?: string;
  queued?: boolean;
  error?: string;
}

export async function persistUploadToCloud(
  input: Omit<PersistUploadPayload, 'organizationId'> & {
    organizationId?: string;
    userId?: string;
    existingUploadId?: string;
    syncRunId?: string;
  },
  accessToken?: string,
): Promise<PersistUploadResult> {
  if (!isCloudPersistenceEnabled()) {
    return { ok: false, error: 'Cloud persistence not configured' };
  }

  const body: PersistUploadPayload = {
    organizationId: input.organizationId ?? getActiveOrganizationId(),
    userId: input.userId,
    fileName: input.fileName,
    cohortName: input.cohortName,
    source: input.source,
    schemaSignature: input.schemaSignature,
    sheetName: input.sheetName,
    rowCount: input.rowCount,
    changedColumns: input.changedColumns,
    headers: input.headers,
    rawRows: input.rawRows,
    mapping: input.mapping,
    discoveredColumns: input.discoveredColumns,
    existingUploadId: input.existingUploadId,
    syncRunId: input.syncRunId,
  };

  if (accessToken && body.rawRows?.length && body.headers?.length) {
    const direct = await publishRosterDirectToStorage({
      organizationId: body.organizationId,
      cohortName: body.cohortName,
      fileName: body.fileName,
      headers: body.headers,
      rawRows: body.rawRows,
      mapping: body.mapping as ColumnMapping | undefined,
      discoveredColumns: body.discoveredColumns as DiscoveredColumn[] | undefined,
    });
    if (direct.ok) {
      try {
        const api = await postPersistUpload(body, accessToken);
        if (api.ok) return api;
      } catch {
        // Student roster is already in public storage; API metadata is optional.
      }
      return { ok: true };
    }
  }

  return postPersistUpload(body, accessToken);
}

async function postPersistUpload(
  body: PersistUploadPayload,
  accessToken?: string,
): Promise<PersistUploadResult> {
  try {
    const res = await fetch(`${API_BASE}/api/persist-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      enqueueSyncItem({ endpoint: `${API_BASE}/api/persist-upload`, body });
      return { ok: false, queued: true, error: err || `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { uploadId: string; versionId: string };
    return { ok: true, uploadId: data.uploadId, versionId: data.versionId };
  } catch (e) {
    enqueueSyncItem({ endpoint: `${API_BASE}/api/persist-upload`, body });
    return { ok: false, queued: true, error: (e as Error).message };
  }
}

export async function persistSchemaProfileToCloud(
  input: {
    organizationId?: string;
    userId?: string;
    fileSignature: string;
    headers: string[];
    mapping: Record<string, unknown>;
  },
  accessToken?: string,
): Promise<boolean> {
  if (!isCloudPersistenceEnabled()) return false;

  const body = {
    organizationId: input.organizationId ?? getActiveOrganizationId(),
    userId: input.userId,
    fileSignature: input.fileSignature,
    headers: input.headers,
    mapping: input.mapping,
  };

  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/persist-schema-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    enqueueSyncItem({ endpoint: `${import.meta.env.VITE_API_BASE ?? ''}/api/persist-schema-profile`, body });
    return false;
  }
}

export async function listCloudUploads(
  organizationId?: string,
  accessToken?: string,
): Promise<{ id: string; file_name: string; cohort_name: string; source: string; row_count: number; created_at: string }[]> {
  if (!isCloudPersistenceEnabled()) return [];

  const orgId = organizationId ?? getActiveOrganizationId();
  const res = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/list-uploads?orgId=${encodeURIComponent(orgId)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { uploads: { id: string; file_name: string; cohort_name: string; source: string; row_count: number; created_at: string }[] };
  return data.uploads ?? [];
}

export async function restoreUploadVersion(
  versionId: string,
  accessToken?: string,
): Promise<{ ok: boolean; payload?: ParsedExcelPayload; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/restore-upload-version?versionId=${encodeURIComponent(versionId)}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err || `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { payload: ParsedExcelPayload };
    return { ok: true, payload: data.payload };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listUploadVersions(
  uploadId: string,
  accessToken?: string,
): Promise<{ id: string; version_number: number; row_count: number; created_at: string; sync_source: string }[]> {
  if (!isCloudPersistenceEnabled()) return [];
  try {
    const res = await fetch(`${API_BASE}/api/list-upload-versions?uploadId=${encodeURIComponent(uploadId)}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { versions: { id: string; version_number: number; row_count: number; created_at: string; sync_source: string }[] };
    return data.versions ?? [];
  } catch {
    return [];
  }
}

/** Load latest cloud-persisted cohort for student email lookup (no auth). */
export async function fetchLatestCohortPayload(
  organizationId?: string,
): Promise<{ payload: ParsedExcelPayload; meta: { fileName: string; cohortName: string; loadedAt: string; studentCount: number } } | null> {
  if (!isCloudPersistenceEnabled()) return null;

  const orgId = organizationId ?? getActiveOrganizationId();
  const base = `${API_BASE}/api/list-uploads?orgId=${encodeURIComponent(orgId)}&mode=latest-payload`;

  const tryUrl = async (url: string) => {
    const res = await fetch(url);
    if (res.status === 503) return { misconfigured: true as const };
    if (!res.ok) return null;
    return (await res.json()) as CohortFetchResult;
  };

  try {
    let result = await tryUrl(base);
    if (result && 'misconfigured' in result) {
      throw new Error('cloud_misconfigured');
    }
    if (!result) {
      result = await tryUrl(`${base}&fallback=any`);
      if (result && 'misconfigured' in result) {
        throw new Error('cloud_misconfigured');
      }
    }
    if (result) return result;

    return await fetchPublicCohortPayload(orgId);
  } catch (e) {
    if ((e as Error).message === 'cloud_misconfigured') throw e;
    return fetchPublicCohortPayload(orgId);
  }
}
