import type { AuditEventType, AuditLogEntry } from '../types/productionTypes';
import type { SyncContext } from '../types/repositoryTypes';
import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from '../services/orgScopedStorage';
import { hydrateEntity, mergeAuditLogs, pushEntityToCloud } from './repositoryCloudSync';

const BASE_KEY = 'vs_audit_log';
const LEGACY_KEY = 'vs_audit_log_v1';
const MAX_ENTRIES = 500;

function readLocal(orgId?: string): AuditLogEntry[] {
  const org = orgId ?? resolveOrgId();
  return (
    readScoped<AuditLogEntry[]>(BASE_KEY, org) ??
    migrateLegacyKey<AuditLogEntry>(LEGACY_KEY, BASE_KEY, org) ??
    []
  );
}

function writeLocal(entries: AuditLogEntry[], orgId?: string): void {
  writeScoped(BASE_KEY, entries.slice(0, MAX_ENTRIES), orgId ?? resolveOrgId());
}

export const auditRepository = {
  list(query = '', limit = 100, ctx?: SyncContext): AuditLogEntry[] {
    const q = query.trim().toLowerCase();
    return readLocal(ctx?.organizationId)
      .filter(e => {
        if (!q) return true;
        return (
          e.message.toLowerCase().includes(q) ||
          e.type.includes(q) ||
          Object.values(e.details ?? {}).some(v => String(v).toLowerCase().includes(q))
        );
      })
      .slice(0, limit);
  },

  create(type: AuditEventType, message: string, details?: AuditLogEntry['details'], ctx?: SyncContext): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    writeLocal([entry, ...readLocal(ctx?.organizationId)], ctx?.organizationId);
    void auditRepository.sync(ctx);
    return entry;
  },

  clear(ctx?: SyncContext): void {
    writeLocal([], ctx?.organizationId);
    void auditRepository.sync(ctx);
  },

  async sync(ctx?: SyncContext): Promise<boolean> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    return pushEntityToCloud('audit_logs', readLocal(orgId), { ...ctx, organizationId: orgId });
  },

  async hydrate(ctx?: SyncContext): Promise<AuditLogEntry[]> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    const local = readLocal(orgId);
    const merged = await hydrateEntity('audit_logs', local, mergeAuditLogs, { ...ctx, organizationId: orgId });
    writeLocal(merged, orgId);
    return merged;
  },
};

export function appendAuditLog(
  type: AuditEventType,
  message: string,
  details?: AuditLogEntry['details'],
  ctx?: SyncContext,
): AuditLogEntry {
  return auditRepository.create(type, message, details, ctx);
}

export function listAuditLog(query = '', limit = 100, ctx?: SyncContext): AuditLogEntry[] {
  return auditRepository.list(query, limit, ctx);
}

export function clearAuditLog(ctx?: SyncContext): void {
  auditRepository.clear(ctx);
}
