import type { SchemaProfile } from '../types/dynamicSchema';
import type { SavedFilterView } from '../types/opsTypes';
import type { AuditLogEntry } from '../types/productionTypes';
import type { UploadSnapshot } from '../types/intelligenceTypes';
import type { RiskActionRecord } from '../types/opsTypes';

/** Saved views: latest updated_at wins per id. */
export function mergeSavedViews(local: SavedFilterView[], remote: SavedFilterView[]): SavedFilterView[] {
  const map = new Map<string, SavedFilterView>();
  for (const item of [...local, ...remote]) {
    const prev = map.get(item.id);
    if (!prev || item.updatedAt > prev.updatedAt) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Risk actions: append-only union by id. */
export function mergeRiskActions(local: RiskActionRecord[], remote: RiskActionRecord[]): RiskActionRecord[] {
  const map = new Map<string, RiskActionRecord>();
  for (const item of [...local, ...remote]) map.set(item.id, item);
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Audit logs: append-only union by id, cap handled by caller. */
export function mergeAuditLogs(local: AuditLogEntry[], remote: AuditLogEntry[]): AuditLogEntry[] {
  const map = new Map<string, AuditLogEntry>();
  for (const item of [...local, ...remote]) map.set(item.id, item);
  return [...map.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Schema profiles: newest updated_at wins per fileSignature. */
export function mergeSchemaProfiles(local: SchemaProfile[], remote: SchemaProfile[]): SchemaProfile[] {
  const map = new Map<string, SchemaProfile>();
  for (const item of [...local, ...remote]) {
    const key = item.fileSignature;
    const prev = map.get(key);
    if (!prev || (item.updatedAt ?? '') > (prev.updatedAt ?? '')) map.set(key, item);
  }
  return [...map.values()];
}

/** Upload snapshots: immutable — union by id, prefer local order for ties. */
export function mergeUploadSnapshots(local: UploadSnapshot[], remote: UploadSnapshot[]): UploadSnapshot[] {
  const map = new Map<string, UploadSnapshot>();
  for (const item of [...remote, ...local]) map.set(item.id, item);
  return [...map.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
