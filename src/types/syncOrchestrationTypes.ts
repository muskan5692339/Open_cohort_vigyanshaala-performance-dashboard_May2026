import type { ClassWiseAttendanceEntry } from '../services/classWiseAttendance';
import type { ColumnMapping, DiscoveredColumn } from './dynamicSchema';
import type { ParsedExcelPayload } from '../services/loadMetricsFromParsedExcel';
import type { FuzzyHeaderMatch, SchemaMigrationSummary } from './productionTypes';

export type SyncOrchestrationStatus = 'success' | 'warning' | 'failed';
export type SyncRunStatus = 'idle' | 'syncing' | 'success' | 'warning' | 'failed';
export type SyncHealthScore = 'Excellent' | 'Good' | 'Warning' | 'Critical';
export type SyncIntervalMinutes = 'manual' | 15 | 30 | 60;

export interface WorkbookMeta {
  fileName: string;
  fileSizeBytes: number;
  sheetNames: string[];
  selectedSheet: string;
  recommendedSheet: string | null;
}

export interface CloudWorkbookSyncResult {
  status: SyncOrchestrationStatus;
  uploadedAt: string;
  rowCount: number;
  schemaSignature: string;
  changedColumns: SchemaMigrationSummary['changes'];
  reusedMappings: FuzzyHeaderMatch[];
  warnings: string[];
  errors: string[];
  workbookMeta: WorkbookMeta;
  parsedPayload: ParsedExcelPayload | null;
  requiresMappingReview: boolean;
  schemaMigration: SchemaMigrationSummary;
  healthScore: SyncHealthScore;
  insights: string[];
  sheetName: string;
  durationMs: number;
}

export interface SyncRunRecord {
  id: string;
  organizationId: string;
  uploadId?: string | null;
  uploadVersionId?: string | null;
  source: 'onedrive' | 'excel' | 'manual';
  status: SyncRunStatus;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  rowsProcessed: number;
  schemaChanged: boolean;
  warningCount: number;
  errorMessage?: string | null;
  insights: string[];
  healthScore?: SyncHealthScore | null;
  workbookFilename?: string | null;
  schemaSignature?: string | null;
}

export interface SyncSchedulerPrefs {
  autoSyncEnabled: boolean;
  intervalMinutes: SyncIntervalMinutes;
  lastSyncAt: string | null;
  lastSyncStatus: SyncRunStatus | null;
  paused: boolean;
}

export type SyncProgressPhase =
  | 'idle'
  | 'fetching'
  | 'validating'
  | 'previewing'
  | 'parsing'
  | 'mapping'
  | 'persisting'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface SyncProgressState {
  phase: SyncProgressPhase;
  message: string;
  pct: number;
}

export interface RestoreVersionResult {
  ok: boolean;
  payload?: ParsedExcelPayload;
  error?: string;
}

export function buildParsedPayload(input: {
  parsed: {
    students: { data: import('./syncTypes').ParsedStudent[] };
    attendance: { data: import('./syncTypes').ParsedAttendance[] };
    assignments: { data: import('./syncTypes').ParsedAssignment[] };
    quiz: { data: import('./syncTypes').ParsedQuiz[] };
    rawRows?: Record<string, string>[];
    headers?: string[];
    discoveredColumns?: DiscoveredColumn[];
    fileSignature?: string;
    classWiseAttendance?: ClassWiseAttendanceEntry[];
    classWiseAttendanceColumns?: string[];
  };
  fileName: string;
  cohortName: string;
  schemaColumns: DiscoveredColumn[];
  mapping: ColumnMapping;
}): ParsedExcelPayload {
  return {
    cohortName: input.cohortName,
    fileName: input.fileName,
    students: input.parsed.students.data,
    attendance: input.parsed.attendance.data,
    assignments: input.parsed.assignments.data,
    quiz: input.parsed.quiz.data,
    rawRows: input.parsed.rawRows ?? [],
    headers: input.parsed.headers ?? [],
    discoveredColumns: input.schemaColumns,
    mapping: input.mapping,
    classWiseAttendance: input.parsed.classWiseAttendance ?? [],
    classWiseAttendanceColumns: input.parsed.classWiseAttendanceColumns ?? [],
  };
}
