const LEASE_KEY = 'vs_sync_lock_v2';
const LEGACY_LEASE_KEY = 'vs_sync_lock_v1';
const DEFAULT_TTL_MS = 90_000;
const HEARTBEAT_MS = 15_000;
const STALE_HEARTBEAT_MS = DEFAULT_TTL_MS * 2;

export interface SyncLease {
  owner: string;
  tabLabel: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface SyncLeaseInfo {
  lease: SyncLease | null;
  isStale: boolean;
  isOwnedByThisTab: boolean;
  foreignTabActive: boolean;
  canTakeoverStale: boolean;
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let coordinatorInstalled = false;

function tabOwnerId(): string {
  const key = 'vs_tab_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function tabLabel(): string {
  try {
    return document.title.slice(0, 40) || 'Dashboard tab';
  } catch {
    return 'Dashboard tab';
  }
}

function readLease(): SyncLease | null {
  try {
    const raw = localStorage.getItem(LEASE_KEY) ?? localStorage.getItem(LEGACY_LEASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncLease;
    if (!parsed.owner || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLease(lease: SyncLease): void {
  localStorage.setItem(LEASE_KEY, JSON.stringify(lease));
  try {
    localStorage.removeItem(LEGACY_LEASE_KEY);
  } catch {
    // ignore
  }
}

export function isLeaseStale(lease: SyncLease | null): boolean {
  if (!lease) return true;
  const heartbeatAge = Date.now() - new Date(lease.heartbeatAt ?? lease.expiresAt).getTime();
  if (heartbeatAge > STALE_HEARTBEAT_MS) return true;
  return new Date(lease.expiresAt).getTime() <= Date.now();
}

export function getSyncLeaseInfo(): SyncLeaseInfo {
  const lease = readLease();
  const owner = tabOwnerId();
  const stale = isLeaseStale(lease);
  const isOwned = Boolean(lease && !stale && lease.owner === owner);
  return {
    lease,
    isStale: stale,
    isOwnedByThisTab: isOwned,
    foreignTabActive: Boolean(lease && !stale && lease.owner !== owner),
    canTakeoverStale: Boolean(lease && stale),
  };
}

export function acquireSyncLease(ttlMs = DEFAULT_TTL_MS): boolean {
  const owner = tabOwnerId();
  const existing = readLease();
  if (existing && !isLeaseStale(existing) && existing.owner !== owner) {
    return false;
  }
  const now = new Date().toISOString();
  writeLease({
    owner,
    tabLabel: tabLabel(),
    acquiredAt: existing?.acquiredAt ?? now,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  startLeaseHeartbeat(ttlMs);
  return true;
}

export function renewSyncLease(ttlMs = DEFAULT_TTL_MS): boolean {
  const owner = tabOwnerId();
  const existing = readLease();
  if (existing && !isLeaseStale(existing) && existing.owner !== owner) return false;
  const now = new Date().toISOString();
  writeLease({
    owner,
    tabLabel: tabLabel(),
    acquiredAt: existing?.acquiredAt ?? now,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  return true;
}

export function releaseSyncLease(): void {
  stopLeaseHeartbeat();
  const owner = tabOwnerId();
  const existing = readLease();
  if (existing?.owner === owner || isLeaseStale(existing)) {
    localStorage.removeItem(LEASE_KEY);
  }
}

export function requestLeaseTakeover(): boolean {
  const existing = readLease();
  if (existing && !isLeaseStale(existing)) return false;
  releaseOrphanedLease();
  return acquireSyncLease();
}

export function releaseOrphanedLease(): void {
  const lease = readLease();
  if (isLeaseStale(lease)) {
    localStorage.removeItem(LEASE_KEY);
  }
}

export function getSyncLeaseOwner(): string | null {
  const lease = readLease();
  if (!lease || isLeaseStale(lease)) return null;
  return lease.owner;
}

export function ownsSyncLease(): boolean {
  return getSyncLeaseInfo().isOwnedByThisTab;
}

export function startLeaseHeartbeat(ttlMs = DEFAULT_TTL_MS): void {
  stopLeaseHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (document.hidden) return;
    renewSyncLease(ttlMs);
  }, HEARTBEAT_MS);
}

export function stopLeaseHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** Install visibility + unload handlers once per app boot. */
export function initSyncLeaseCoordinator(): () => void {
  if (coordinatorInstalled || typeof window === 'undefined') return () => {};
  coordinatorInstalled = true;

  const onVisibility = () => {
    if (document.hidden) {
      stopLeaseHeartbeat();
    } else if (ownsSyncLease()) {
      renewSyncLease();
      startLeaseHeartbeat();
    } else {
      releaseOrphanedLease();
    }
  };

  const onUnload = () => {
    if (ownsSyncLease()) releaseSyncLease();
  };

  window.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onUnload);

  return () => {
    window.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onUnload);
    coordinatorInstalled = false;
  };
}
