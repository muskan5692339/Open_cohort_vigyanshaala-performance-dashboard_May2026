import { recordTelemetry } from './telemetryService';

export type QueueItemStatus =
  | 'pending'
  | 'syncing'
  | 'retrying'
  | 'synced'
  | 'failed'
  | 'abandoned'
  | 'dead_letter';

export interface CloudQueueItem {
  id: string;
  fingerprint: string;
  entityHash?: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: unknown;
  status: QueueItemStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

const QUEUE_KEY = 'vs_cloud_sync_queue_v3';
const LEGACY_QUEUE_KEY = 'vs_cloud_sync_queue_v2';
const PAUSE_KEY = 'vs_queue_paused';
const MAX_ITEMS = 100;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 120_000;
const BATCH_SIZE = 5;
const STALE_SYNCING_MS = 5 * 60 * 1000;
const DEAD_LETTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES: QueueItemStatus[] = ['pending', 'syncing', 'retrying', 'failed'];

function readQueueRaw(): CloudQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY) ?? localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CloudQueueItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => ({
      ...item,
      status: normalizeStatus(item.status),
    }));
  } catch {
    return [];
  }
}

function normalizeStatus(status: string): QueueItemStatus {
  if (status === 'failed') return 'retrying';
  if (status === 'abandoned') return 'dead_letter';
  return status as QueueItemStatus;
}

function compactQueueForStorage(items: CloudQueueItem[]): CloudQueueItem[] {
  const now = Date.now();
  const trimmed = items
    .filter(item => {
      if (item.status !== 'dead_letter') return true;
      const age = now - new Date(item.updatedAt).getTime();
      return age <= DEAD_LETTER_MAX_AGE_MS;
    })
    .slice(0, MAX_ITEMS);
  return trimmed;
}

function writeQueue(items: CloudQueueItem[]): boolean {
  const payload = compactQueueForStorage(items);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(payload));
    try {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    } catch {
      // ignore
    }
    return true;
  } catch {
    const reduced = payload
      .filter(i => i.status !== 'dead_letter' && i.status !== 'synced')
      .slice(0, Math.floor(MAX_ITEMS * 0.5));
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(reduced));
      recordTelemetry('validation_failure', {
        success: false,
        metadata: { source: 'cloud_sync_queue', reason: 'storage_quota' },
      });
      return true;
    } catch {
      recordTelemetry('validation_failure', {
        success: false,
        metadata: { source: 'cloud_sync_queue', reason: 'storage_quota_critical' },
      });
      return false;
    }
  }
}

function fingerprint(endpoint: string, body: unknown): string {
  return `${endpoint}:${JSON.stringify(body)}`.slice(0, 512);
}

function entityHash(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.versionId === 'string') return `version:${b.versionId}`;
  if (typeof b.entityType === 'string' && b.organizationId) {
    return `entity:${b.organizationId}:${b.entityType}`;
  }
  return undefined;
}

function backoffMs(attempts: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.round(base * jitter);
}

export function isQueuePaused(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function pauseQueue(): void {
  localStorage.setItem(PAUSE_KEY, '1');
}

export function resumeQueue(): void {
  localStorage.removeItem(PAUSE_KEY);
}

export function enqueueCloudOperation(input: {
  endpoint: string;
  body: unknown;
  method?: CloudQueueItem['method'];
  maxAttempts?: number;
}): CloudQueueItem {
  const fp = fingerprint(input.endpoint, input.body);
  const eh = entityHash(input.body);
  const queue = readQueueRaw();

  const duplicate = queue.find(
    i =>
      (i.fingerprint === fp || (eh && i.entityHash === eh)) &&
      ACTIVE_STATUSES.includes(i.status),
  );
  if (duplicate) return duplicate;

  const item: CloudQueueItem = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fingerprint: fp,
    entityHash: eh,
    endpoint: input.endpoint,
    method: input.method ?? 'POST',
    body: input.body,
    status: 'pending',
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 8,
    nextRetryAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeQueue([item, ...queue]);
  return item;
}

export function listQueueItems(status?: QueueItemStatus): CloudQueueItem[] {
  const q = readQueueRaw();
  return status ? q.filter(i => i.status === status) : q;
}

export function updateQueueItem(id: string, patch: Partial<CloudQueueItem>): void {
  const queue = readQueueRaw();
  const idx = queue.findIndex(i => i.id === id);
  if (idx < 0) return;
  queue[idx] = { ...queue[idx], ...patch, updatedAt: new Date().toISOString() };
  writeQueue(queue);
}

export function removeQueueItem(id: string): void {
  writeQueue(readQueueRaw().filter(i => i.id !== id));
}

/** Drop dead-letter items older than retention window. */
export function purgeExpiredDeadLetters(): number {
  const queue = readQueueRaw();
  const now = Date.now();
  const next = queue.filter(item => {
    if (item.status !== 'dead_letter') return true;
    return now - new Date(item.updatedAt).getTime() <= DEAD_LETTER_MAX_AGE_MS;
  });
  const removed = queue.length - next.length;
  if (removed > 0) writeQueue(next);
  return removed;
}

export function cleanupStaleQueueItems(): number {
  const now = Date.now();
  let cleaned = 0;
  const queue = readQueueRaw().map(item => {
    if (item.status !== 'syncing') return item;
    const age = now - new Date(item.updatedAt).getTime();
    if (age > STALE_SYNCING_MS) {
      cleaned += 1;
      return {
        ...item,
        status: 'retrying' as QueueItemStatus,
        nextRetryAt: new Date(now).toISOString(),
        lastError: item.lastError ?? 'Stale syncing state reset',
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  if (cleaned) writeQueue(queue);
  return cleaned;
}

function markDeadLetter(item: CloudQueueItem, err: string): void {
  updateQueueItem(item.id, {
    status: 'dead_letter',
    attempts: item.attempts + 1,
    lastError: err,
  });
  recordTelemetry('queue_failure', {
    metadata: { attempts: item.attempts + 1, endpoint: item.endpoint, error: err.slice(0, 120) },
    success: false,
  });
}

function scheduleRetry(item: CloudQueueItem, err: string, now: number): void {
  const attempts = item.attempts + 1;
  updateQueueItem(item.id, {
    status: 'retrying',
    attempts,
    lastError: err,
    nextRetryAt: new Date(now + backoffMs(attempts)).toISOString(),
  });
  recordTelemetry('queue_retry', { metadata: { attempts, endpoint: item.endpoint } });
}

async function processItem(item: CloudQueueItem, accessToken: string | undefined, now: number): Promise<'synced' | 'retry' | 'dead'> {
  updateQueueItem(item.id, { status: 'syncing' });

  try {
    const res = await fetch(item.endpoint, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(item.body),
    });

    if (res.ok) {
      removeQueueItem(item.id);
      return 'synced';
    }

    const err = await res.text();
    const attempts = item.attempts + 1;
    if (attempts >= item.maxAttempts) {
      markDeadLetter(item, err);
      return 'dead';
    }
    scheduleRetry(item, err, now);
    return 'retry';
  } catch (e) {
    const msg = (e as Error).message;
    const attempts = item.attempts + 1;
    if (attempts >= item.maxAttempts) {
      markDeadLetter(item, msg);
      return 'dead';
    }
    scheduleRetry(item, msg, now);
    return 'retry';
  }
}

export async function processCloudQueue(accessToken?: string): Promise<{ synced: number; failed: number; deadLetter: number }> {
  if (isQueuePaused()) return { synced: 0, failed: 0, deadLetter: 0 };

  cleanupStaleQueueItems();

  const now = Date.now();
  let synced = 0;
  let failed = 0;
  let deadLetter = 0;

  const eligible = readQueueRaw().filter(item => {
    if (item.status === 'synced' || item.status === 'dead_letter' || item.status === 'abandoned') return false;
    if (item.status === 'retrying' || item.status === 'failed') {
      if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > now) return false;
    }
    return item.status === 'pending' || item.status === 'retrying' || item.status === 'failed';
  });

  for (const item of eligible.slice(0, BATCH_SIZE)) {
    const result = await processItem(item, accessToken, now);
    if (result === 'synced') synced += 1;
    else if (result === 'dead') deadLetter += 1;
    else failed += 1;
  }

  return { synced, failed, deadLetter };
}

/** Replay all eligible items in batches until drained or max rounds. */
export async function replayCloudQueue(accessToken?: string, maxRounds = 10): Promise<{ synced: number; failed: number; deadLetter: number }> {
  let totals = { synced: 0, failed: 0, deadLetter: 0 };
  for (let i = 0; i < maxRounds; i++) {
    const round = await processCloudQueue(accessToken);
    totals = {
      synced: totals.synced + round.synced,
      failed: totals.failed + round.failed,
      deadLetter: totals.deadLetter + round.deadLetter,
    };
    if (round.synced === 0 && round.failed === 0 && round.deadLetter === 0) break;
  }
  return totals;
}

export function requeueDeadLetter(id: string): boolean {
  const item = readQueueRaw().find(i => i.id === id);
  if (!item || item.status !== 'dead_letter') return false;
  updateQueueItem(id, {
    status: 'pending',
    attempts: 0,
    nextRetryAt: null,
    lastError: undefined,
  });
  return true;
}
