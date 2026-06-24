import type { UploadSnapshot, UploadSnapshotMetrics } from '../types/intelligenceTypes';
import type { SyncContext } from '../types/repositoryTypes';
import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from '../services/orgScopedStorage';
import { hydrateEntity, mergeUploadSnapshots, pushEntityToCloud } from './repositoryCloudSync';

const BASE_KEY = 'vs_upload_snapshots';
const LEGACY_KEY = 'vs_upload_snapshots_v1';
const MAX_SNAPSHOTS = 20;

function readLocal(orgId?: string): UploadSnapshot[] {
  const org = orgId ?? resolveOrgId();
  return (
    readScoped<UploadSnapshot[]>(BASE_KEY, org) ??
    migrateLegacyKey<UploadSnapshot>(LEGACY_KEY, BASE_KEY, org) ??
    []
  );
}

function writeLocal(snapshots: UploadSnapshot[], orgId?: string): void {
  writeScoped(BASE_KEY, snapshots.slice(0, MAX_SNAPSHOTS), orgId ?? resolveOrgId());
}

export const uploadSnapshotsRepository = {
  list(ctx?: SyncContext): UploadSnapshot[] {
    return readLocal(ctx?.organizationId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  },

  create(input: { fileName: string; metrics: UploadSnapshotMetrics }, ctx?: SyncContext): UploadSnapshot {
    const snapshot: UploadSnapshot = {
      id: `snap-${Date.now()}`,
      fileName: input.fileName,
      uploadedAt: new Date().toISOString(),
      metrics: input.metrics,
    };

    const existing = readLocal(ctx?.organizationId);
    const last = existing[0];
    const isDuplicate =
      last &&
      last.fileName === snapshot.fileName &&
      last.metrics.studentCount === snapshot.metrics.studentCount &&
      Math.abs(last.metrics.healthScore - snapshot.metrics.healthScore) < 0.01 &&
      Date.now() - new Date(last.uploadedAt).getTime() < 60_000;

    if (!isDuplicate) {
      writeLocal([snapshot, ...existing], ctx?.organizationId);
      void uploadSnapshotsRepository.sync(ctx);
    }

    return snapshot;
  },

  getPrevious(currentId?: string, ctx?: SyncContext): UploadSnapshot | null {
    const all = uploadSnapshotsRepository.list(ctx);
    if (!all.length) return null;
    if (currentId) {
      const idx = all.findIndex(s => s.id === currentId);
      if (idx >= 0 && idx + 1 < all.length) return all[idx + 1];
    }
    return all.length > 1 ? all[1] : null;
  },

  getLatest(ctx?: SyncContext): UploadSnapshot | null {
    return uploadSnapshotsRepository.list(ctx)[0] ?? null;
  },

  async sync(ctx?: SyncContext): Promise<boolean> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    return pushEntityToCloud('upload_snapshots', readLocal(orgId), { ...ctx, organizationId: orgId });
  },

  async hydrate(ctx?: SyncContext): Promise<UploadSnapshot[]> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    const local = readLocal(orgId);
    const merged = await hydrateEntity('upload_snapshots', local, mergeUploadSnapshots, { ...ctx, organizationId: orgId });
    writeLocal(merged, orgId);
    return merged;
  },
};

export function listUploadSnapshots(ctx?: SyncContext): UploadSnapshot[] {
  return uploadSnapshotsRepository.list(ctx);
}

export function getPreviousSnapshot(currentId?: string, ctx?: SyncContext): UploadSnapshot | null {
  return uploadSnapshotsRepository.getPrevious(currentId, ctx);
}

export function saveUploadSnapshot(input: { fileName: string; metrics: UploadSnapshotMetrics }, ctx?: SyncContext): UploadSnapshot {
  return uploadSnapshotsRepository.create(input, ctx);
}

export function getLatestSnapshot(ctx?: SyncContext): UploadSnapshot | null {
  return uploadSnapshotsRepository.getLatest(ctx);
}
