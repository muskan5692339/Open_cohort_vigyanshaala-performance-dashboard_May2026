import { isQueuePaused, listQueueItems, type CloudQueueItem, type QueueItemStatus } from './cloudSyncQueue';
import { listTelemetry, type TelemetryEvent, type TelemetryEventName } from './telemetryService';
import { resolveOrgId } from './orgScopedStorage';

export interface TimingStats {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  successRate: number;
}

export interface DailyBucket {
  date: string;
  counts: Record<string, number>;
  failures: number;
}

export interface TelemetryDashboardMetrics {
  uploadTiming: TimingStats | null;
  syncTiming: TimingStats | null;
  exportTiming: TimingStats | null;
  restoreTiming: TimingStats | null;
  queueHealth: {
    pending: number;
    retrying: number;
    deadLetter: number;
    paused: boolean;
    failureRate: number;
  };
  schemaStability: {
    driftEvents: number;
    instabilityEvents: number;
    trend: 'stable' | 'watch' | 'unstable';
  };
  mappingReviewRate: number;
  syncCancellationRate: number;
  onedriveFetchFailureRate: number;
  recentFailures: { message: string; at: string; source: string }[];
  rollingCounts: Record<string, number>;
  dailyBuckets: DailyBucket[];
}

const DURATION_EVENTS: TelemetryEventName[] = [
  'upload_duration',
  'parse_duration',
  'sync_duration',
  'export_duration',
  'restore_duration',
];

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

function timingStats(events: TelemetryEvent[], name: TelemetryEventName): TimingStats | null {
  const matched = events.filter(e => e.name === name && e.durationMs != null);
  if (!matched.length) return null;
  const durations = matched.map(e => e.durationMs!);
  const successes = matched.filter(e => e.success !== false).length;
  return {
    count: matched.length,
    avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    successRate: Math.round((successes / matched.length) * 100),
  };
}

function rate(events: TelemetryEvent[], name: TelemetryEventName, windowMs = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - windowMs;
  const relevant = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  if (!relevant.length) return 0;
  const count = relevant.filter(e => e.name === name).length;
  return Math.round((count / relevant.length) * 1000) / 10;
}

function buildDailyBuckets(events: TelemetryEvent[], days = 7): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, counts: {}, failures: 0 });
  }

  for (const e of events) {
    const key = e.timestamp.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.counts[e.name] = (bucket.counts[e.name] ?? 0) + 1;
    if (
      e.name === 'validation_failure' ||
      e.name === 'queue_failure' ||
      e.name === 'onedrive_fetch_failure' ||
      e.success === false
    ) {
      bucket.failures += 1;
    }
  }

  return [...buckets.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function queueCounts(items: CloudQueueItem[]): Partial<Record<QueueItemStatus, number>> {
  const counts: Partial<Record<QueueItemStatus, number>> = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

export function aggregateTelemetry(orgId?: string): TelemetryDashboardMetrics {
  const org = orgId ?? resolveOrgId();
  const events = listTelemetry(300, org);
  const queue = listQueueItems();
  const qCounts = queueCounts(queue);

  const queueAttempts = events.filter(e => e.name === 'queue_retry' || e.name === 'queue_failure').length;
  const queueTotal = events.filter(e =>
    ['queue_retry', 'queue_failure', 'sync_duration'].includes(e.name),
  ).length;

  const drift = events.filter(e => e.name === 'schema_drift').length;
  const instability = events.filter(e => e.name === 'schema_instability').length;
  let trend: TelemetryDashboardMetrics['schemaStability']['trend'] = 'stable';
  if (instability >= 3 || drift >= 5) trend = 'unstable';
  else if (instability >= 1 || drift >= 2) trend = 'watch';

  const recentFailures = events
    .filter(
      e =>
        e.name === 'validation_failure' ||
        e.name === 'queue_failure' ||
        e.name === 'onedrive_fetch_failure' ||
        (e.name === 'restore_attempt' && e.success === false),
    )
    .slice(0, 8)
    .map(e => ({
      message: String(e.metadata?.error ?? e.metadata?.message ?? e.name),
      at: e.timestamp,
      source: e.name,
    }));

  const rollingCounts: Record<string, number> = {};
  for (const name of DURATION_EVENTS) {
    rollingCounts[name] = events.filter(e => e.name === name).length;
  }

  return {
    uploadTiming: timingStats(events, 'upload_duration') ?? timingStats(events, 'parse_duration'),
    syncTiming: timingStats(events, 'sync_duration'),
    exportTiming: timingStats(events, 'export_duration'),
    restoreTiming: timingStats(events, 'restore_duration') ?? timingStats(events, 'restore_attempt'),
    queueHealth: {
      pending: qCounts.pending ?? 0,
      retrying: (qCounts.retrying ?? 0) + (qCounts.failed ?? 0),
      deadLetter: qCounts.dead_letter ?? 0,
      paused: isQueuePaused(),
      failureRate: queueTotal ? Math.round((queueAttempts / queueTotal) * 100) : 0,
    },
    schemaStability: { driftEvents: drift, instabilityEvents: instability, trend },
    mappingReviewRate: rate(events, 'mapping_review'),
    syncCancellationRate: rate(events, 'sync_cancelled'),
    onedriveFetchFailureRate: rate(events, 'onedrive_fetch_failure'),
    recentFailures,
    rollingCounts,
    dailyBuckets: buildDailyBuckets(events),
  };
}
