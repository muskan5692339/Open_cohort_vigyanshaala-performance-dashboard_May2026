import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncConfig } from '../types/syncTypes';
import type { CloudWorkbookSyncResult, SyncProgressState, SyncSchedulerPrefs } from '../types/syncOrchestrationTypes';
import { fetchOneDriveWorkbookFile, orchestrateCloudWorkbookSync } from '../services/cloudWorkbookFetcher';
import { loadSyncConfig } from '../services/oneDriveSync';
import { useUploadedExcel } from '../context/UploadedExcelContext';
import { useAuth } from '../context/AuthContext';
import { persistUploadToCloud } from '../services/cloud/uploadPersistence';
import {
  completeLocalSyncRun,
  createLocalSyncRun,
  mapOrchestrationStatusToRunStatus,
  persistSyncRunToCloud,
} from '../services/syncRunStore';
import {
  formatLastSync,
  getSyncLock,
  loadSchedulerPrefs,
  recordSyncCompletion,
  saveSchedulerPrefs,
  setSyncLock,
  startSyncScheduler,
  stopSyncScheduler,
} from '../services/syncScheduler';
import { appendAuditLog } from '../services/auditLogStore';
import { useSyncContext } from './useSyncContext';
import {
  acquireSyncLease,
  getSyncLeaseInfo,
  releaseSyncLease,
  renewSyncLease,
  requestLeaseTakeover,
} from '../services/syncLeaseManager';
import { recordTelemetry } from '../services/telemetryService';

export interface OneDriveOrchestratorState {
  progress: SyncProgressState;
  lastResult: CloudWorkbookSyncResult | null;
  error: string | null;
  schedulerPrefs: SyncSchedulerPrefs;
  lastUploadId: string | null;
  lastVersionId: string | null;
}

const IDLE_PROGRESS: SyncProgressState = { phase: 'idle', message: 'Ready', pct: 0 };

export function useOneDriveOrchestrator(cohortName: string, onDataImported?: (info: { cohortName: string }) => void) {
  const { loadFromParsed, payload } = useUploadedExcel();
  const { session, user, organization, can } = useAuth();
  const syncCtx = useSyncContext();
  const abortRef = useRef<AbortController | null>(null);
  const lastUploadIdRef = useRef<string | null>(null);

  const [leaseInfo, setLeaseInfo] = useState(() => getSyncLeaseInfo());

  useEffect(() => {
    const id = setInterval(() => setLeaseInfo(getSyncLeaseInfo()), 5000);
    return () => clearInterval(id);
  }, []);

  const [state, setState] = useState<OneDriveOrchestratorState>({
    progress: IDLE_PROGRESS,
    lastResult: null,
    error: null,
    schedulerPrefs: loadSchedulerPrefs(),
    lastUploadId: null,
    lastVersionId: null,
  });

  const setProgress = useCallback((progress: SyncProgressState) => {
    setState(s => ({ ...s, progress }));
  }, []);

  const runSync = useCallback(
    async (cfgOverride?: SyncConfig | null) => {
      if (getSyncLock()) return;
      if (!acquireSyncLease()) {
        const info = getSyncLeaseInfo();
        setLeaseInfo(info);
        const msg = info.foreignTabActive
          ? `Sync owned by another tab (${info.lease?.tabLabel ?? 'unknown'}). Wait or take over if stale.`
          : 'Could not acquire sync lease.';
        setState(s => ({ ...s, error: msg }));
        return;
      }
      setLeaseInfo(getSyncLeaseInfo());
      if (!can('upload')) {
        releaseSyncLease();
        setState(s => ({ ...s, error: 'Your role cannot run sync.' }));
        return;
      }

      const cfg = cfgOverride ?? loadSyncConfig();
      if (!cfg?.oneDriveFileId && !cfg?.shareUrl) {
        releaseSyncLease();
        setState(s => ({ ...s, error: 'Connect OneDrive workbook first.' }));
        return;
      }

      setSyncLock(true);
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const localRun = createLocalSyncRun({
        organizationId: organization?.id,
        source: 'onedrive',
        workbookFilename: cfg.resolvedFileName,
      });

      setState(s => ({
        ...s,
        error: null,
        lastResult: null,
        progress: { phase: 'fetching', message: 'Fetching workbook from OneDrive…', pct: 5 },
      }));

      const completeRun = async (
        result: CloudWorkbookSyncResult,
        uploadId?: string | null,
        versionId?: string | null,
      ) => {
        const runStatus = mapOrchestrationStatusToRunStatus(result.status);
        const completed = completeLocalSyncRun(localRun.id, {
          status: runStatus,
          completedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          rowsProcessed: result.rowCount,
          schemaChanged: result.schemaMigration.changes.length > 0,
          warningCount: result.warnings.length,
          errorMessage: result.errors[0] ?? null,
          insights: result.insights,
          healthScore: result.healthScore,
          uploadId: uploadId ?? null,
          uploadVersionId: versionId ?? null,
          schemaSignature: result.schemaSignature,
        });

        if (completed) void persistSyncRunToCloud(completed, session?.access_token);
        const prefs = recordSyncCompletion(runStatus);
        setState(s => ({
          ...s,
          schedulerPrefs: prefs,
          lastUploadId: uploadId ?? s.lastUploadId,
          lastVersionId: versionId ?? s.lastVersionId,
        }));
      };

      try {
        let file: File;
        let attempt = 0;
        while (true) {
          try {
            renewSyncLease();
            file = await fetchOneDriveWorkbookFile({
              fileId: cfg.oneDriveFileId,
              driveId: cfg.oneDriveDriveId,
              shareUrl: cfg.shareUrl,
              fileName: cfg.resolvedFileName,
              organizationId: organization?.id,
              accessToken: session?.access_token,
              signal,
            });
            break;
          } catch (e) {
            attempt += 1;
            recordTelemetry('onedrive_fetch_failure', {
              success: false,
              metadata: { attempt, error: (e as Error).message.slice(0, 120) },
            });
            if (attempt >= 2 || signal.aborted) throw e;
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        if (signal.aborted) {
          recordTelemetry('sync_cancelled', { metadata: { phase: 'fetch' } });
          completeLocalSyncRun(localRun.id, { status: 'failed', errorMessage: 'Cancelled', completedAt: new Date().toISOString() });
          setProgress({ phase: 'cancelled', message: 'Sync cancelled', pct: 0 });
          return;
        }

        const result = await orchestrateCloudWorkbookSync({
          file,
          cohortName: cohortName.trim() || 'Imported Cohort',
          signal,
          sheetNames: cfg.sheetNames,
          onProgress: (phase, message, pct) => {
            renewSyncLease();
            setProgress({
              phase: phase as SyncProgressState['phase'],
              message,
              pct,
            });
          },
        });

        if (result.status === 'failed' || !result.parsedPayload) {
          recordTelemetry('sync_duration', { durationMs: result.durationMs, metadata: { status: 'failed' } });
          await completeRun(result);
          setState(s => ({
            ...s,
            lastResult: result,
            error: result.errors[0] ?? 'Sync failed — previous dashboard preserved.',
            progress: { phase: 'failed', message: result.errors[0] ?? 'Sync failed', pct: 100 },
          }));
          appendAuditLog('upload', `OneDrive sync failed: ${cfg.resolvedFileName ?? 'workbook'}`, {
            error: result.errors[0] ?? 'unknown',
          }, syncCtx);
          return;
        }

        if (result.requiresMappingReview) {
          recordTelemetry('mapping_review', { metadata: { unmapped: result.schemaMigration.unmapped.length } });
          appendAuditLog('mapping_change', 'OneDrive sync loaded with mapping review recommended', {
            unmapped: result.schemaMigration.unmapped.length,
          }, syncCtx);
        }

        loadFromParsed(result.parsedPayload);

        setProgress({ phase: 'persisting', message: 'Saving sync version…', pct: 92 });

        const persist = await persistUploadToCloud(
          {
            organizationId: organization?.id,
            userId: user?.id,
            existingUploadId: lastUploadIdRef.current ?? undefined,
            fileName: result.workbookMeta.fileName,
            cohortName: cohortName.trim() || result.parsedPayload.cohortName,
            source: 'onedrive',
            schemaSignature: result.schemaSignature,
            sheetName: result.sheetName,
            rowCount: result.rowCount,
            changedColumns: result.changedColumns,
            headers: result.parsedPayload.headers,
            rawRows: result.parsedPayload.rawRows,
            mapping: result.parsedPayload.mapping,
            discoveredColumns: result.parsedPayload.discoveredColumns,
          },
          session?.access_token,
        );

        if (persist.uploadId) lastUploadIdRef.current = persist.uploadId;

        recordTelemetry('sync_duration', {
          durationMs: result.durationMs,
          metadata: { status: result.status, rows: result.rowCount },
        });
        recordTelemetry('upload_size', { metadata: { bytes: file.size, source: 'onedrive' } });

        await completeRun(result, persist.uploadId, persist.versionId);

        appendAuditLog('upload', `OneDrive sync ${result.status}: ${result.workbookMeta.fileName}`, {
          rows: result.rowCount,
          warnings: result.warnings.length,
        }, syncCtx);

        setState(s => ({
          ...s,
          lastResult: result,
          error: null,
          progress: { phase: 'done', message: 'Sync complete', pct: 100 },
          lastUploadId: persist.uploadId ?? s.lastUploadId,
          lastVersionId: persist.versionId ?? s.lastVersionId,
        }));

        onDataImported?.({ cohortName: cohortName.trim() || result.parsedPayload.cohortName });
      } catch (e) {
        const msg = (e as Error).message;
        completeLocalSyncRun(localRun.id, {
          status: 'failed',
          errorMessage: msg,
          completedAt: new Date().toISOString(),
        });
        setState(s => ({
          ...s,
          error: msg,
          progress: { phase: 'failed', message: msg, pct: 100 },
        }));
      } finally {
        setSyncLock(false);
        releaseSyncLease();
        setLeaseInfo(getSyncLeaseInfo());
        abortRef.current = null;
      }
    },
    [can, cohortName, loadFromParsed, onDataImported, organization?.id, session?.access_token, setProgress, syncCtx, user?.id],
  );

  const cancelSync = useCallback(() => {
    abortRef.current?.abort();
    setSyncLock(false);
    releaseSyncLease();
    setLeaseInfo(getSyncLeaseInfo());
    recordTelemetry('sync_cancelled', { metadata: { manual: true } });
    setProgress({ phase: 'cancelled', message: 'Cancelling…', pct: 0 });
  }, [setProgress]);

  const takeoverLease = useCallback(() => {
    const ok = requestLeaseTakeover();
    setLeaseInfo(getSyncLeaseInfo());
    if (ok) setState(s => ({ ...s, error: null }));
    return ok;
  }, []);

  const updateScheduler = useCallback(
    (patch: Partial<SyncSchedulerPrefs>) => {
      const prefs = saveSchedulerPrefs(patch);
      setState(s => ({ ...s, schedulerPrefs: prefs }));
    },
    [],
  );

  useEffect(() => {
    startSyncScheduler(() => runSync());
    return () => stopSyncScheduler();
  }, [runSync, state.schedulerPrefs.autoSyncEnabled, state.schedulerPrefs.intervalMinutes, state.schedulerPrefs.paused]);

  return {
    state,
    runSync,
    cancelSync,
    takeoverLease,
    updateScheduler,
    isSyncing: getSyncLock(),
    leaseInfo,
    formatLastSync,
    hasExistingData: Boolean(payload),
  };
}
