import type { SyncHealthScore, SyncRunRecord, SyncRunStatus } from '../types/syncOrchestrationTypes';
import { getActiveOrganizationId, isCloudPersistenceEnabled } from './cloud/cloudConfig';

const STORAGE_KEY = 'vs_sync_runs_v1';
const MAX_LOCAL = 50;
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function readLocal(): SyncRunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncRunRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(runs: SyncRunRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_LOCAL)));
}

export function listSyncRunsLocal(limit = 30): SyncRunRecord[] {
  return readLocal()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

export function getLatestSyncRun(): SyncRunRecord | null {
  return listSyncRunsLocal(1)[0] ?? null;
}

export function createLocalSyncRun(input: {
  organizationId?: string;
  source: SyncRunRecord['source'];
  workbookFilename?: string;
}): SyncRunRecord {
  const run: SyncRunRecord = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    organizationId: input.organizationId ?? getActiveOrganizationId(),
    source: input.source,
    status: 'syncing',
    startedAt: new Date().toISOString(),
    rowsProcessed: 0,
    schemaChanged: false,
    warningCount: 0,
    insights: [],
    workbookFilename: input.workbookFilename ?? null,
  };
  writeLocal([run, ...readLocal()]);
  return run;
}

export function completeLocalSyncRun(
  id: string,
  update: Partial<
    Pick<
      SyncRunRecord,
      | 'status'
      | 'completedAt'
      | 'durationMs'
      | 'rowsProcessed'
      | 'schemaChanged'
      | 'warningCount'
      | 'errorMessage'
      | 'insights'
      | 'healthScore'
      | 'uploadId'
      | 'uploadVersionId'
      | 'schemaSignature'
    >
  >,
): SyncRunRecord | null {
  const runs = readLocal();
  const idx = runs.findIndex(r => r.id === id);
  if (idx < 0) return null;
  runs[idx] = {
    ...runs[idx],
    ...update,
    completedAt: update.completedAt ?? new Date().toISOString(),
  };
  writeLocal(runs);
  return runs[idx];
}

export async function persistSyncRunToCloud(
  run: SyncRunRecord,
  accessToken?: string,
): Promise<boolean> {
  if (!isCloudPersistenceEnabled()) return false;
  try {
    const res = await fetch(`${API_BASE}/api/persist-sync-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(run),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listSyncRunsCloud(
  organizationId?: string,
  accessToken?: string,
): Promise<SyncRunRecord[]> {
  if (!isCloudPersistenceEnabled()) return [];
  const orgId = organizationId ?? getActiveOrganizationId();
  try {
    const res = await fetch(`${API_BASE}/api/list-sync-runs?orgId=${encodeURIComponent(orgId)}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) return listSyncRunsLocal();
    const data = (await res.json()) as { runs: SyncRunRecord[] };
    return data.runs?.length ? data.runs : listSyncRunsLocal();
  } catch {
    return listSyncRunsLocal();
  }
}

export function mapOrchestrationStatusToRunStatus(
  status: 'success' | 'warning' | 'failed',
): SyncRunStatus {
  if (status === 'success') return 'success';
  if (status === 'warning') return 'warning';
  return 'failed';
}

export function statusBadgeColor(status: SyncRunStatus): string {
  switch (status) {
    case 'success':
      return '#15803d';
    case 'warning':
      return '#d97706';
    case 'failed':
      return '#dc2626';
    case 'syncing':
      return '#2563eb';
    default:
      return '#6b7280';
  }
}

export type { SyncRunRecord, SyncRunStatus, SyncHealthScore };
