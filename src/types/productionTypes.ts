export type ValidationSeverity = 'error' | 'warning';

export interface UploadValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  suggestion?: string;
}

export interface UploadValidationResult {
  valid: boolean;
  issues: UploadValidationIssue[];
  fileSizeBytes: number;
  fileName: string;
}

export interface SheetPreview {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  previewRows: string[][];
  isEmpty: boolean;
}

export interface WorkbookPreview {
  sheetNames: string[];
  sheets: SheetPreview[];
  recommendedSheet: string | null;
}

export interface SchemaMigrationChange {
  kind: 'added' | 'removed' | 'renamed' | 'type_changed' | 'unmapped';
  column: string;
  previousColumn?: string;
  previousType?: string;
  currentType?: string;
  similarity?: number;
  message: string;
}

export interface SchemaMigrationSummary {
  hasPreviousProfile: boolean;
  added: string[];
  removed: string[];
  renamed: SchemaMigrationChange[];
  typeChanges: SchemaMigrationChange[];
  unmapped: string[];
  changes: SchemaMigrationChange[];
  summaryText: string;
}

export type AuditEventType =
  | 'upload'
  | 'mapping_change'
  | 'saved_view'
  | 'export'
  | 'risk_action'
  | 'demo_load'
  | 'validation'
  | 'health';

export interface AuditLogEntry {
  id: string;
  type: AuditEventType;
  message: string;
  details?: Record<string, string | number | boolean>;
  timestamp: string;
}

export type HealthStatus = 'ok' | 'warning' | 'error' | 'idle';

export interface DashboardHealthMetrics {
  uploadSuccessRate: number;
  uploadAttempts: number;
  uploadSuccesses: number;
  mappingSuccessRate: number;
  mappingAttempts: number;
  mappingSuccesses: number;
  analyticsStatus: HealthStatus;
  analyticsLastMs: number | null;
  analyticsRowCount: number | null;
  exportStatus: HealthStatus;
  exportLastAt: string | null;
  lastUpdated: string;
}

export interface FuzzyHeaderMatch {
  currentHeader: string;
  profileHeader: string;
  score: number;
}
