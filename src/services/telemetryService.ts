import { readScoped, resolveOrgId, writeScoped } from './orgScopedStorage';

const TELEMETRY_BASE = 'vs_telemetry';

export type TelemetryEventName =
  | 'upload_duration'
  | 'parse_duration'
  | 'sync_duration'
  | 'export_duration'
  | 'restore_duration'
  | 'validation_failure'
  | 'schema_drift'
  | 'schema_instability'
  | 'mapping_review'
  | 'upload_size'
  | 'queue_retry'
  | 'queue_failure'
  | 'sync_cancelled'
  | 'onedrive_fetch_failure'
  | 'restore_attempt'
  | 'unauthorized_org_access'
  | 'forbidden_org_access';

export interface TelemetryEvent {
  id: string;
  name: TelemetryEventName;
  durationMs?: number;
  success?: boolean;
  metadata?: Record<string, string | number | boolean>;
  timestamp: string;
}

const MAX_EVENTS = 300;
const RETENTION_DAYS = 14;

function readEvents(orgId?: string): TelemetryEvent[] {
  return readScoped<TelemetryEvent[]>(TELEMETRY_BASE, orgId) ?? [];
}

function pruneEvents(events: TelemetryEvent[]): TelemetryEvent[] {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return events
    .filter(e => new Date(e.timestamp).getTime() >= cutoff)
    .slice(0, MAX_EVENTS);
}

export function recordTelemetry(
  name: TelemetryEventName,
  input?: {
    durationMs?: number;
    success?: boolean;
    metadata?: Record<string, string | number | boolean>;
  },
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    durationMs: input?.durationMs,
    success: input?.success,
    metadata: input?.metadata,
    timestamp: new Date().toISOString(),
  };
  const orgId = resolveOrgId();
  const next = pruneEvents([event, ...readEvents(orgId)]);
  if (!writeScoped(TELEMETRY_BASE, next, orgId)) {
    writeScoped(TELEMETRY_BASE, pruneEvents(next.slice(0, Math.floor(MAX_EVENTS * 0.6))), orgId);
  }
  return event;
}

export function listTelemetry(limit = 50, orgId?: string): TelemetryEvent[] {
  return readEvents(orgId).slice(0, limit);
}

export function telemetrySummary(orgId?: string): Record<string, number> {
  const events = readEvents(orgId);
  const summary: Record<string, number> = {};
  for (const e of events) {
    summary[e.name] = (summary[e.name] ?? 0) + 1;
  }
  return summary;
}

export function cleanupTelemetry(orgId?: string): number {
  const org = orgId ?? resolveOrgId();
  const before = readEvents(org).length;
  const pruned = pruneEvents(readEvents(org));
  writeScoped(TELEMETRY_BASE, pruned, org);
  return before - pruned.length;
}

/** Optional cloud sync hook — no-op until backend endpoint exists. */
export async function syncTelemetryToCloud(_accessToken?: string): Promise<boolean> {
  return false;
}
