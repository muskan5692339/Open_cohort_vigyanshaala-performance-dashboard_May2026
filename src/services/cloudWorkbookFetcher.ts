import type { ColumnMapping } from '../types/dynamicSchema';
import type {
  CloudWorkbookSyncResult,
  SyncHealthScore,
  WorkbookMeta,
} from '../types/syncOrchestrationTypes';
import { buildParsedPayload as buildPayload } from '../types/syncOrchestrationTypes';
import type { UploadValidationIssue } from '../types/productionTypes';
import { validateUploadFile } from './uploadValidation';
import { previewWorkbook } from './workbookPreview';
import { parseWorkbookSheet } from './selectedSheetParser';
import { loadClassWiseAttendanceFromFile } from './classWiseAttendance';
import { parseUploadedFile } from './excelParser';
import { applyProfileWithFuzzyMatch, resolveProfileForUpload } from './fuzzyHeaderMatching';
import { detectSchemaChanges, latestProfileByHeaders } from './schemaChangeDetector';
import { generateSyncHealthScore, generateSyncInsights } from './syncInsights';
import { loadSyncConfig } from './oneDriveSync';
import { recordTelemetry } from './telemetryService';

export type SyncProgressCallback = (phase: string, message: string, pct: number) => void;

export interface OrchestrateSyncInput {
  file: File;
  cohortName: string;
  sheetName?: string;
  sheetNames?: { students: string; attendance: string; assignments: string; quiz: string };
  signal?: AbortSignal;
  onProgress?: SyncProgressCallback;
}

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function mappingFromColumns(
  columns: ReturnType<typeof applyProfileWithFuzzyMatch>['columns'],
): ColumnMapping {
  return Object.fromEntries(
    columns.map(c => [
      c.name,
      {
        mappedType: c.mappedType,
        mappedRole: c.mappedRole,
        mappedDisplayGroup: c.mappedDisplayGroup,
      },
    ]),
  );
}

/**
 * Main OneDrive / cloud workbook orchestration layer.
 * Wraps Sprint 7 validation → preview → parse → mapping reuse — does NOT modify parsers.
 */
export async function orchestrateCloudWorkbookSync(
  input: OrchestrateSyncInput,
): Promise<CloudWorkbookSyncResult> {
  const t0 = performance.now();
  const cfg = loadSyncConfig();
  const sheetNames =
    input.sheetNames ??
    cfg?.sheetNames ?? { students: 'Student Master', attendance: 'Attendance', assignments: 'Assignments', quiz: 'Quiz' };

  const warnings: string[] = [];
  const errors: string[] = [];
  let status: CloudWorkbookSyncResult['status'] = 'success';

  const progress = (phase: string, message: string, pct: number) => {
    input.onProgress?.(phase, message, pct);
  };

  if (aborted(input.signal)) {
    return emptyResult('failed', ['Sync cancelled'], ['Sync was cancelled before start.'], t0);
  }

  progress('validating', 'Validating workbook…', 10);
  const validation = await validateUploadFile(input.file);
  validation.issues
    .filter((i: UploadValidationIssue) => i.severity === 'warning')
    .forEach(i => warnings.push(i.message));

  if (!validation.valid) {
    validation.issues
      .filter((i: UploadValidationIssue) => i.severity === 'error')
      .forEach(i => errors.push(i.message));
    recordTelemetry('validation_failure', {
      durationMs: Math.round(performance.now() - t0),
      metadata: { errors: errors.length, fileName: input.file.name },
    });
    return emptyResult('failed', warnings, errors, t0, input.file.name);
  }

  if (aborted(input.signal)) {
    return emptyResult('failed', warnings, ['Sync cancelled during validation.'], t0);
  }

  progress('previewing', 'Previewing sheets…', 25);
  const preview = await previewWorkbook(input.file);
  const sheetName = input.sheetName ?? preview.recommendedSheet ?? preview.sheetNames[0];
  if (!sheetName) {
    errors.push('No sheet found in workbook.');
    return emptyResult('failed', warnings, errors, t0, input.file.name);
  }

  if (aborted(input.signal)) {
    return emptyResult('failed', warnings, ['Sync cancelled during preview.'], t0);
  }

  progress('parsing', `Parsing sheet "${sheetName}"…`, 45);
  let parsed = await parseWorkbookSheet(input.file, sheetName, input.cohortName);

  if (!parsed.rawRows?.length) {
    warnings.push(`Sheet "${sheetName}" empty — trying multi-sheet parser fallback.`);
    try {
      parsed = await parseUploadedFile(input.file, sheetNames, input.cohortName);
    } catch (e) {
      errors.push(`Parse fallback failed: ${(e as Error).message}`);
    }
  }

  const classWise = await loadClassWiseAttendanceFromFile(input.file);
  parsed = {
    ...parsed,
    classWiseAttendance: classWise?.entries ?? parsed.classWiseAttendance ?? [],
    classWiseAttendanceColumns: classWise?.sessionColumns ?? parsed.classWiseAttendanceColumns ?? [],
  };

  if (parsed.students.errors.length) {
    parsed.students.errors.slice(0, 3).forEach(e => warnings.push(`Students: ${e.message}`));
  }
  if (!parsed.rawRows?.length && parsed.students.data.length === 0) {
    errors.push('No data rows could be parsed from the workbook.');
    return emptyResult('failed', warnings, errors, t0, input.file.name, preview, sheetName);
  }

  if (aborted(input.signal)) {
    return emptyResult('failed', warnings, ['Sync cancelled during parse.'], t0);
  }

  progress('mapping', 'Reusing mapping profiles…', 65);
  const headers = parsed.headers ?? [];
  const discovered = parsed.discoveredColumns ?? [];
  const resolved = resolveProfileForUpload(parsed.fileSignature, headers);
  const previousForMigration = resolved.profile ?? latestProfileByHeaders(headers);
  const { columns: mappedCols, fuzzyMatches } = applyProfileWithFuzzyMatch(
    discovered,
    resolved.profile,
    headers,
  );
  const schemaMigration = detectSchemaChanges(headers, mappedCols, previousForMigration);
  const mapping = mappingFromColumns(mappedCols);

  if (schemaMigration.unmapped.length) {
    warnings.push(`${schemaMigration.unmapped.length} column(s) need mapping review.`);
  }
  if (schemaMigration.removed.length) {
    warnings.push(`${schemaMigration.removed.length} column(s) removed since last profile.`);
  }

  const requiresMappingReview =
    schemaMigration.unmapped.length > 0 ||
    (schemaMigration.added.length > 2 && fuzzyMatches.length === 0);

  if (requiresMappingReview) {
    status = 'warning';
  }

  if (warnings.length && status === 'success') {
    status = 'warning';
  }

  const workbookMeta: WorkbookMeta = {
    fileName: input.file.name,
    fileSizeBytes: input.file.size,
    sheetNames: preview.sheetNames,
    selectedSheet: sheetName,
    recommendedSheet: preview.recommendedSheet,
  };

  const parsedPayload =
    parsed.rawRows?.length || parsed.students.data.length
      ? buildPayload({
          parsed,
          fileName: input.file.name,
          cohortName: input.cohortName,
          schemaColumns: mappedCols,
          mapping,
        })
      : null;

  const healthScore: SyncHealthScore = generateSyncHealthScore({
    status,
    warningCount: warnings.length,
    schemaMigration,
    parseErrors: errors.length,
    fuzzyMatchCount: fuzzyMatches.length,
  });

  const insights = generateSyncInsights({
    schemaMigration,
    fuzzyMatches,
    warnings,
    errors,
    sheetName,
    status,
    requiresMappingReview,
  });

  progress('done', 'Workbook processed', 100);

  const durationMs = Math.round(performance.now() - t0);
  recordTelemetry('parse_duration', { durationMs, metadata: { rows: parsed.rawRows?.length ?? 0 } });
  recordTelemetry('upload_size', { metadata: { bytes: input.file.size, source: 'cloud' } });
  if (schemaMigration.changes.length > 0) {
    recordTelemetry('schema_drift', { metadata: { changes: schemaMigration.changes.length } });
    if (schemaMigration.changes.length >= 5 || schemaMigration.unmapped.length >= 3) {
      recordTelemetry('schema_instability', { metadata: { changes: schemaMigration.changes.length, unmapped: schemaMigration.unmapped.length } });
    }
  }
  if (requiresMappingReview) {
    recordTelemetry('mapping_review', { metadata: { unmapped: schemaMigration.unmapped.length } });
  }

  return {
    status,
    uploadedAt: new Date().toISOString(),
    rowCount: parsed.rawRows?.length ?? parsed.students.data.length,
    schemaSignature: parsed.fileSignature ?? '',
    changedColumns: schemaMigration.changes,
    reusedMappings: fuzzyMatches,
    warnings,
    errors,
    workbookMeta,
    parsedPayload,
    requiresMappingReview,
    schemaMigration,
    healthScore,
    insights,
    sheetName,
    durationMs,
  };
}

function emptyResult(
  status: CloudWorkbookSyncResult['status'],
  warnings: string[],
  errors: string[],
  t0: number,
  fileName = '',
  preview?: Awaited<ReturnType<typeof previewWorkbook>>,
  sheetName = '',
): CloudWorkbookSyncResult {
  return {
    status,
    uploadedAt: new Date().toISOString(),
    rowCount: 0,
    schemaSignature: '',
    changedColumns: [],
    reusedMappings: [],
    warnings,
    errors,
    workbookMeta: {
      fileName,
      fileSizeBytes: 0,
      sheetNames: preview?.sheetNames ?? [],
      selectedSheet: sheetName,
      recommendedSheet: preview?.recommendedSheet ?? null,
    },
    parsedPayload: null,
    requiresMappingReview: false,
    schemaMigration: {
      hasPreviousProfile: false,
      added: [],
      removed: [],
      renamed: [],
      typeChanges: [],
      unmapped: [],
      changes: [],
      summaryText: errors[0] ?? 'Sync failed',
    },
    healthScore: 'Critical',
    insights: errors.length ? errors : warnings,
    sheetName,
    durationMs: Math.round(performance.now() - t0),
  };
}

/** Fetch OneDrive workbook via server API and return as File. */
export async function fetchOneDriveWorkbookFile(input: {
  fileId?: string;
  driveId?: string;
  shareUrl?: string;
  fileName?: string;
  organizationId?: string;
  accessToken?: string;
  signal?: AbortSignal;
}): Promise<File> {
  const res = await fetch('/api/fetch-workbook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    },
    body: JSON.stringify({
      fileId: input.fileId,
      driveId: input.driveId,
      shareUrl: input.shareUrl,
      organizationId: input.organizationId,
    }),
    signal: input.signal,
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* use raw */
    }
    throw new Error(msg || `Fetch failed HTTP ${res.status}`);
  }

  const data = JSON.parse(text) as { fileName: string; base64: string };
  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], data.fileName || input.fileName || 'workbook.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function fetchOneDriveWorkbookAsFile(
  fetchFn: () => Promise<ArrayBuffer>,
  fileName: string,
): Promise<File> {
  const buffer = await fetchFn();
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** @deprecated Use orchestrateCloudWorkbookSync */
export async function importCloudWorkbook(input: {
  file: File;
  sheetName?: string;
  cohortName: string;
  sheetNames?: { students: string; attendance: string; assignments: string; quiz: string };
}) {
  const result = await orchestrateCloudWorkbookSync(input);
  if (!result.parsedPayload) throw new Error(result.errors[0] ?? 'Import failed');
  return {
    parsed: result.parsedPayload,
    preview: await previewWorkbook(input.file),
    validation: await validateUploadFile(input.file),
    sheetName: result.sheetName,
  };
}
