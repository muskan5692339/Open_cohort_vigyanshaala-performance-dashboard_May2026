import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import { loadMetricsFromParsedExcel } from './loadMetricsFromParsedExcel';
import { readScoped, resolveOrgId, writeScoped } from './orgScopedStorage';
import { recordTelemetry } from './telemetryService';

const SESSION_KEY = 'vs_uploaded_excel_v2';
const HISTORY_BASE = 'vs_restore_history';
const INTERRUPTED_RESTORE_KEY = 'vs_interrupted_restore';

export interface RestoreHistoryEntry {
  id: string;
  restoredFromVersionId: string;
  restoredAt: string;
  restoredBy?: string;
  fileName: string;
  success: boolean;
  errorMessage?: string;
}

export interface RestoreResult {
  ok: boolean;
  payload?: ParsedExcelPayload;
  error?: string;
  rolledBack?: boolean;
}

function readHistory(orgId?: string): RestoreHistoryEntry[] {
  return readScoped<RestoreHistoryEntry[]>(HISTORY_BASE, orgId) ?? [];
}

function appendHistory(entry: RestoreHistoryEntry, orgId?: string): void {
  writeScoped(HISTORY_BASE, [entry, ...readHistory(orgId)].slice(0, 50), orgId);
}

export function listRestoreHistory(orgId?: string): RestoreHistoryEntry[] {
  return readHistory(orgId);
}

export function markInterruptedRestore(versionId: string): void {
  try {
    sessionStorage.setItem(INTERRUPTED_RESTORE_KEY, versionId);
  } catch {
    // ignore
  }
}

export function clearInterruptedRestore(): void {
  try {
    sessionStorage.removeItem(INTERRUPTED_RESTORE_KEY);
  } catch {
    // ignore
  }
}

export function getInterruptedRestoreVersionId(): string | null {
  try {
    return sessionStorage.getItem(INTERRUPTED_RESTORE_KEY);
  } catch {
    return null;
  }
}

/** Validate payload before session commit — dry-run metrics load, no analytics engine changes. */
export function validateRestorePayload(payload: ParsedExcelPayload): { ok: boolean; error?: string } {
  if (!payload?.fileName?.trim()) return { ok: false, error: 'Missing file name' };
  if (!payload?.cohortName?.trim()) return { ok: false, error: 'Missing cohort name' };
  if (!Array.isArray(payload.students)) return { ok: false, error: 'Invalid students array' };
  if (!payload.rawRows?.length && !payload.students.length) {
    return { ok: false, error: 'Workbook has no rows' };
  }
  if (payload.mapping != null && typeof payload.mapping !== 'object') {
    return { ok: false, error: 'Invalid mapping object' };
  }
  try {
    loadMetricsFromParsedExcel(payload);
  } catch (e) {
    return { ok: false, error: `Metrics hydration failed: ${(e as Error).message}` };
  }
  return { ok: true };
}

function readSessionBackup(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionBackup(raw: string | null): void {
  if (!raw) {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    return;
  }
  try {
    sessionStorage.setItem(SESSION_KEY, raw);
  } catch {
    // ignore
  }
}

function verifySessionCommit(expectedFileName: string): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { payload?: ParsedExcelPayload };
    return parsed.payload?.fileName === expectedFileName;
  } catch {
    return false;
  }
}

/**
 * Execute restore with transactional rollback guard.
 * `loadFn` applies payload to session; throws on failure.
 */
export async function executeRestoreTransaction(input: {
  versionId: string;
  fetchPayload: () => Promise<ParsedExcelPayload | null>;
  loadFn: (payload: ParsedExcelPayload) => void;
  restoredBy?: string;
  fileName?: string;
}): Promise<RestoreResult> {
  const orgId = resolveOrgId();
  const backup = readSessionBackup();
  const historyId = `restore-${Date.now()}`;
  const t0 = performance.now();

  markInterruptedRestore(input.versionId);

  try {
    const payload = await input.fetchPayload();
    if (!payload) {
      clearInterruptedRestore();
      appendHistory({
        id: historyId,
        restoredFromVersionId: input.versionId,
        restoredAt: new Date().toISOString(),
        restoredBy: input.restoredBy,
        fileName: input.fileName ?? 'workbook',
        success: false,
        errorMessage: 'Empty payload',
      }, orgId);
      recordTelemetry('restore_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: false,
        metadata: { versionId: input.versionId, error: 'empty' },
      });
      return { ok: false, error: 'Empty payload' };
    }

    const validation = validateRestorePayload(payload);
    if (!validation.ok) {
      clearInterruptedRestore();
      appendHistory({
        id: historyId,
        restoredFromVersionId: input.versionId,
        restoredAt: new Date().toISOString(),
        restoredBy: input.restoredBy,
        fileName: input.fileName ?? payload.fileName,
        success: false,
        errorMessage: validation.error,
      }, orgId);
      recordTelemetry('restore_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: false,
        metadata: { versionId: input.versionId, error: validation.error ?? 'validation' },
      });
      return { ok: false, error: validation.error };
    }

    input.loadFn(payload);

    if (!verifySessionCommit(payload.fileName)) {
      throw new Error('Session commit verification failed');
    }

    clearInterruptedRestore();
    appendHistory({
      id: historyId,
      restoredFromVersionId: input.versionId,
      restoredAt: new Date().toISOString(),
      restoredBy: input.restoredBy,
      fileName: input.fileName ?? payload.fileName,
      success: true,
    }, orgId);

    recordTelemetry('restore_duration', {
      durationMs: Math.round(performance.now() - t0),
      success: true,
      metadata: { versionId: input.versionId, rows: payload.rawRows?.length ?? payload.students.length },
    });

    return { ok: true, payload };
  } catch (e) {
    writeSessionBackup(backup);

    clearInterruptedRestore();
    appendHistory({
      id: historyId,
      restoredFromVersionId: input.versionId,
      restoredAt: new Date().toISOString(),
      restoredBy: input.restoredBy,
      fileName: input.fileName ?? 'workbook',
      success: false,
      errorMessage: (e as Error).message,
    }, orgId);

    recordTelemetry('restore_duration', {
      durationMs: Math.round(performance.now() - t0),
      success: false,
      metadata: { versionId: input.versionId, error: (e as Error).message, rolledBack: Boolean(backup) },
    });

    return { ok: false, error: (e as Error).message, rolledBack: Boolean(backup) };
  }
}
