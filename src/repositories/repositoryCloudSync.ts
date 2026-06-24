import type { SyncContext } from '../types/repositoryTypes';
import { isCloudPersistenceEnabled } from '../services/cloud/cloudConfig';
import { enqueueCloudOperation } from '../services/cloudSyncQueue';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  mergeAuditLogs,
  mergeRiskActions,
  mergeSavedViews,
  mergeSchemaProfiles,
  mergeUploadSnapshots,
} from '../services/conflictResolution';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export type HybridEntityType =
  | 'saved_views'
  | 'risk_actions'
  | 'audit_logs'
  | 'schema_profiles'
  | 'upload_snapshots';

export async function pushEntityToCloud<T>(
  entityType: HybridEntityType,
  payload: T[],
  ctx?: SyncContext,
): Promise<boolean> {
  if (!ctx?.organizationId || !isCloudPersistenceEnabled()) return false;

  const body = {
    organizationId: ctx.organizationId,
    entityType,
    payload,
    userId: ctx.userId,
  };

  try {
    const res = await fetch(`${API_BASE}/api/sync-hybrid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ctx.accessToken ? { Authorization: `Bearer ${ctx.accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return true;
    enqueueCloudOperation({ endpoint: `${API_BASE}/api/sync-hybrid`, body });
    return false;
  } catch {
    enqueueCloudOperation({ endpoint: `${API_BASE}/api/sync-hybrid`, body });
    return false;
  }
}

export async function pullEntityFromCloud<T>(
  entityType: HybridEntityType,
  ctx?: SyncContext,
): Promise<T[] | null> {
  if (!ctx?.organizationId || !isSupabaseConfigured()) return null;

  try {
    const res = await fetch(
      `${API_BASE}/api/sync-hybrid?orgId=${encodeURIComponent(ctx.organizationId)}&entityType=${entityType}`,
      {
        headers: ctx.accessToken ? { Authorization: `Bearer ${ctx.accessToken}` } : {},
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { payload: T[] };
    return data.payload ?? [];
  } catch {
    return null;
  }
}

export async function hydrateEntity<T>(
  entityType: HybridEntityType,
  local: T[],
  merge: (local: T[], remote: T[]) => T[],
  ctx?: SyncContext,
): Promise<T[]> {
  const remote = await pullEntityFromCloud<T>(entityType, ctx);
  if (!remote?.length) return local;
  return merge(local, remote);
}

export { mergeSavedViews, mergeRiskActions, mergeAuditLogs, mergeSchemaProfiles, mergeUploadSnapshots };
