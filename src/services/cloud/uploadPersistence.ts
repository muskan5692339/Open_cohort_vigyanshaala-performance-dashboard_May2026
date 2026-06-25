import type { PersistUploadPayload } from '../../types/cloudTypes';
import type { ParsedExcelPayload } from '../loadMetricsFromParsedExcel';
import { enqueueSyncItem, getActiveOrganizationId, isCloudPersistenceEnabled } from './cloudConfig';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

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
  try {
    const res = await fetch(
      `${API_BASE}/api/list-uploads?orgId=${encodeURIComponent(orgId)}&mode=latest-payload`,
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      payload: ParsedExcelPayload;
      meta: { fileName: string; cohortName: string; loadedAt: string; studentCount: number };
    };
  } catch {
    return null;
  }
}
