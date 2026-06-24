import type { RiskActionRecord, RiskActionType } from '../types/opsTypes';
import type { SyncContext } from '../types/repositoryTypes';
import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from '../services/orgScopedStorage';
import { hydrateEntity, mergeRiskActions, pushEntityToCloud } from './repositoryCloudSync';
import { appendAuditLog } from './auditRepository';

const BASE_KEY = 'vs_risk_actions';
const LEGACY_KEY = 'vs_risk_actions_v1';

function readLocal(orgId?: string): RiskActionRecord[] {
  const org = orgId ?? resolveOrgId();
  return (
    readScoped<RiskActionRecord[]>(BASE_KEY, org) ??
    migrateLegacyKey<RiskActionRecord>(LEGACY_KEY, BASE_KEY, org) ??
    []
  );
}

function writeLocal(records: RiskActionRecord[], orgId?: string): void {
  writeScoped(BASE_KEY, records, orgId ?? resolveOrgId());
}

export function actionTypeLabel(type: RiskActionType): string {
  switch (type) {
    case 'note':
      return 'Note Added';
    case 'contacted':
      return 'Marked Contacted';
    case 'follow_up':
      return 'Follow-up Required';
    case 'resolved':
      return 'Marked Resolved';
  }
}

export const riskActionsRepository = {
  list(studentKey?: string, ctx?: SyncContext): RiskActionRecord[] {
    const all = readLocal(ctx?.organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return studentKey ? all.filter(r => r.studentKey === studentKey) : all;
  },

  create(
    input: { studentKey: string; studentLabel: string; actionType: RiskActionType; note?: string },
    ctx?: SyncContext,
  ): RiskActionRecord {
    const record: RiskActionRecord = {
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studentKey: input.studentKey,
      studentLabel: input.studentLabel,
      actionType: input.actionType,
      note: input.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    writeLocal([record, ...readLocal(ctx?.organizationId)], ctx?.organizationId);
    appendAuditLog('risk_action', `${actionTypeLabel(record.actionType)} — ${record.studentLabel}`, {
      studentKey: record.studentKey,
      actionType: record.actionType,
    }, ctx);
    void riskActionsRepository.sync(ctx);
    return record;
  },

  latestByStudent(ctx?: SyncContext): Map<string, RiskActionRecord> {
    const map = new Map<string, RiskActionRecord>();
    for (const record of readLocal(ctx?.organizationId)) {
      if (!map.has(record.studentKey)) map.set(record.studentKey, record);
    }
    return map;
  },

  async sync(ctx?: SyncContext): Promise<boolean> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    return pushEntityToCloud('risk_actions', readLocal(orgId), { ...ctx, organizationId: orgId });
  },

  async hydrate(ctx?: SyncContext): Promise<RiskActionRecord[]> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    const local = readLocal(orgId);
    const merged = await hydrateEntity('risk_actions', local, mergeRiskActions, { ...ctx, organizationId: orgId });
    writeLocal(merged, orgId);
    return merged;
  },
};

export function listRiskActions(studentKey?: string, ctx?: SyncContext): RiskActionRecord[] {
  return riskActionsRepository.list(studentKey, ctx);
}

export function addRiskAction(
  input: { studentKey: string; studentLabel: string; actionType: RiskActionType; note?: string },
  ctx?: SyncContext,
): RiskActionRecord {
  return riskActionsRepository.create(input, ctx);
}

export function latestActionByStudent(ctx?: SyncContext): Map<string, RiskActionRecord> {
  return riskActionsRepository.latestByStudent(ctx);
}
