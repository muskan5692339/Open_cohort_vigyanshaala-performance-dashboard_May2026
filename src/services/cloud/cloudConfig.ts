import { DEFAULT_ORG_ID } from '../../types/cloudTypes';
import { replayCloudQueue } from '../cloudSyncQueue';

const ORG_KEY = 'vs_active_org_id';

export function getActiveOrganizationId(): string {
  try {
    return localStorage.getItem(ORG_KEY) || import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

export function setActiveOrganizationId(orgId: string): void {
  try {
    localStorage.setItem(ORG_KEY, orgId);
  } catch {
    // ignore
  }
}

export function isCloudPersistenceEnabled(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return Boolean(url && url.startsWith('http'));
}

/** Process offline queue with exponential backoff + batch replay. */
export async function flushSyncQueue(accessToken?: string): Promise<number> {
  const r = await replayCloudQueue(accessToken);
  return r.synced;
}

export { enqueueCloudOperation as enqueueSyncItem } from '../cloudSyncQueue';
