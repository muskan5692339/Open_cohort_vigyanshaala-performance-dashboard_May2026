import { cleanupStaleQueueItems, isQueuePaused, purgeExpiredDeadLetters, replayCloudQueue } from './cloudSyncQueue';
import { getInterruptedRestoreVersionId, clearInterruptedRestore } from './restoreTransactionManager';
import { initSyncLeaseCoordinator, releaseOrphanedLease } from './syncLeaseManager';
import { cleanupTelemetry } from './telemetryService';
import { recordTelemetry } from './telemetryService';

export interface OfflineRecoveryResult {
  queue: { synced: number; failed: number; deadLetter: number };
  staleQueueItemsReset: number;
  orphanedLeaseCleared: boolean;
  interruptedRestoreCleared: boolean;
}

let recoveryRunning = false;
let coordinatorCleanup: (() => void) | null = null;

export function ensureOfflineRecoveryCoordinator(): void {
  if (!coordinatorCleanup) {
    coordinatorCleanup = initSyncLeaseCoordinator();
  }
}

export async function runOfflineRecovery(accessToken?: string): Promise<OfflineRecoveryResult> {
  if (recoveryRunning) {
    return { queue: { synced: 0, failed: 0, deadLetter: 0 }, staleQueueItemsReset: 0, orphanedLeaseCleared: false, interruptedRestoreCleared: false };
  }

  recoveryRunning = true;
  ensureOfflineRecoveryCoordinator();

  try {
    releaseOrphanedLease();
    const staleQueueItemsReset = cleanupStaleQueueItems();
    purgeExpiredDeadLetters();
    const interrupted = getInterruptedRestoreVersionId();
    if (interrupted) {
      clearInterruptedRestore();
      recordTelemetry('restore_attempt', {
        success: false,
        metadata: { interrupted: true, versionId: interrupted },
      });
    }

    cleanupTelemetry();

    const queue = isQueuePaused()
      ? { synced: 0, failed: 0, deadLetter: 0 }
      : await replayCloudQueue(accessToken);

    return {
      queue,
      staleQueueItemsReset,
      orphanedLeaseCleared: true,
      interruptedRestoreCleared: Boolean(interrupted),
    };
  } finally {
    recoveryRunning = false;
  }
}

/** Detect reconnect and replay safely. */
export function installOfflineRecoveryListeners(getAccessToken: () => Promise<string | undefined>): () => void {
  ensureOfflineRecoveryCoordinator();

  const onOnline = () => {
    void getAccessToken().then(token => runOfflineRecovery(token));
  };

  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}
