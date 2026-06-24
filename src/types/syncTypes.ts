export interface SyncConfig {
  azureClientId: string;
  azureTenantId: string;
  oneDriveFileId: string;
  oneDriveDriveId: string;
  serviceRoleKey: string;
  /** Full OneDrive / SharePoint sharing URL — resolved server-side to fileId + driveId */
  shareUrl?: string;
  /** Display name resolved from the sharing URL */
  resolvedFileName?: string;
  sheetNames: {
    students: string;
    attendance: string;
    assignments: string;
    quiz: string;
  };
  syncFrequency: 'manual' | 'daily' | 'weekly';
  lastConfigured?: string;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  azureClientId: '',
  azureTenantId: 'common',
  oneDriveFileId: '',
  oneDriveDriveId: '',
  serviceRoleKey: '',
  shareUrl: '',
  resolvedFileName: '',
  sheetNames: {
    students: 'Student Master',
    attendance: 'Attendance',
    assignments: 'Assignments',
    quiz: 'Quiz',
  },
  syncFrequency: 'manual',
};

export const SYNC_CONFIG_KEY = 'vs_sync_config';

export interface SyncLog {
  id?: string;
  status: 'running' | 'success' | 'error' | 'partial';
  records_updated: number;
  errors: SyncError[];
  run_at: string;
  // extra detail stored locally
  details?: SyncDetails;
}

export interface SyncDetails {
  students: SheetResult;
  attendance: SheetResult;
  assignments: SheetResult;
  quiz: SheetResult;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
  durationMs: number;
  source: 'onedrive' | 'upload';
}

export interface SheetResult {
  rowsRead: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: SyncError[];
}

export interface SyncError {
  row?: number;
  field?: string;
  value?: unknown;
  message: string;
}

export interface ParsedStudent {
  student_id: string;
  name: string;
  email: string;
  college: string;
  program: string;
  cohort: string;
  state: string;
  enrollment_date?: string;
  status: 'Active' | 'Inactive';
  certificate_status?: string;
  /** Wide-format Excel: attendance % as shown in workbook */
  imported_attendance_pct?: number;
  /** Wide-format Excel: assignment completion % */
  imported_assignment_pct?: number;
  /** Wide-format Excel: quiz / final score % */
  imported_quiz_pct?: number;
}

export interface ParsedAttendance {
  student_email: string;
  session_date: string;
  duration_hours: number;
  attended: boolean;
  session_name?: string;
  /** For wide-format: actual attendance percentage (0-100) stored as hours for the hook to compute correctly */
  hours_attended?: number;
}

export interface ParsedAssignment {
  student_email: string;
  assignment_name: string;
  due_date: string;
  status: 'Submitted' | 'Pending' | 'Late Submission';
  submitted_at?: string;
}

export interface ParsedQuiz {
  student_email: string;
  quiz_name: string;
  quiz_date: string;
  score: number;
  total_marks: number;
  percentage: number;
}

export type SyncPhase =
  | 'idle'
  | 'authenticating'
  | 'reading_sheets'
  | 'parsing'
  | 'upserting_students'
  | 'upserting_attendance'
  | 'upserting_assignments'
  | 'upserting_quiz'
  | 'finalizing'
  | 'done'
  | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  message: string;
  pct: number;
  currentSheet?: string;
}
