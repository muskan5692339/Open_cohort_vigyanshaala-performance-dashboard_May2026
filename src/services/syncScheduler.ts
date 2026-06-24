import type { SyncIntervalMinutes, SyncRunStatus, SyncSchedulerPrefs } from '../types/syncOrchestrationTypes';

const PREFS_KEY = 'vs_sync_scheduler_v1';

const DEFAULT_PREFS: SyncSchedulerPrefs = {
  autoSyncEnabled: false,
  intervalMinutes: 'manual',
  lastSyncAt: null,
  lastSyncStatus: null,
  paused: false,
};

export function loadSchedulerPrefs(): SyncSchedulerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveSchedulerPrefs(prefs: Partial<SyncSchedulerPrefs>): SyncSchedulerPrefs {
  const next = { ...loadSchedulerPrefs(), ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function intervalMs(minutes: SyncIntervalMinutes): number | null {
  if (minutes === 'manual') return null;
  return minutes * 60 * 1000;
}

export type SyncTickHandler = () => void | Promise<void>;

let timerId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function getSyncLock(): boolean {
  return isRunning;
}

export function setSyncLock(locked: boolean): void {
  isRunning = locked;
}

export function stopSyncScheduler(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

export function startSyncScheduler(onTick: SyncTickHandler): void {
  stopSyncScheduler();
  const prefs = loadSchedulerPrefs();
  if (prefs.paused || !prefs.autoSyncEnabled) return;

  const ms = intervalMs(prefs.intervalMinutes);
  if (!ms) return;

  timerId = setInterval(() => {
    if (isRunning) return;
    void onTick();
  }, ms);
}

export function recordSyncCompletion(status: SyncRunStatus): SyncSchedulerPrefs {
  return saveSchedulerPrefs({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
  });
}

export const INTERVAL_OPTIONS: { value: SyncIntervalMinutes; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
];

export function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}
