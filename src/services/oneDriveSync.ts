import type { SyncConfig, SyncProgress, SyncDetails, SyncLog } from '../types/syncTypes';
import { getAccessToken, readSheet } from './graphClient';
import { parseStudents, parseAttendance, parseAssignments, parseQuiz, parseUploadedFile } from './excelParser';
import { createServiceClient, upsertStudents, upsertAttendance, upsertAssignments, upsertQuiz, writeSyncLog } from './supabaseUpsert';
import { SYNC_CONFIG_KEY } from '../types/syncTypes';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({ ...cfg, lastConfigured: new Date().toISOString() }));
}

export type ProgressCallback = (p: SyncProgress) => void;

function progress(cb: ProgressCallback, phase: SyncProgress['phase'], message: string, pct: number, currentSheet?: string) {
  cb({ phase, message, pct, currentSheet });
}

/* ── Main OneDrive sync ─────────────────────────────────── */

export async function runOneDriveSync(cfg: SyncConfig, onProgress: ProgressCallback): Promise<SyncDetails> {
  const t0 = Date.now();

  progress(onProgress, 'authenticating', 'Authenticating with Microsoft…', 5);
  const token = await getAccessToken(cfg.azureClientId, cfg.azureTenantId);

  progress(onProgress, 'reading_sheets', 'Reading Student Master sheet…', 15, cfg.sheetNames.students);
  const studentRows = await readSheet(token, cfg.oneDriveFileId, cfg.sheetNames.students, cfg.oneDriveDriveId || undefined);

  progress(onProgress, 'reading_sheets', 'Reading Attendance sheet…', 25, cfg.sheetNames.attendance);
  const attendanceRows = await readSheet(token, cfg.oneDriveFileId, cfg.sheetNames.attendance, cfg.oneDriveDriveId || undefined);

  progress(onProgress, 'reading_sheets', 'Reading Assignments sheet…', 35, cfg.sheetNames.assignments);
  const assignmentRows = await readSheet(token, cfg.oneDriveFileId, cfg.sheetNames.assignments, cfg.oneDriveDriveId || undefined);

  progress(onProgress, 'reading_sheets', 'Reading Quiz sheet…', 45, cfg.sheetNames.quiz);
  const quizRows = await readSheet(token, cfg.oneDriveFileId, cfg.sheetNames.quiz, cfg.oneDriveDriveId || undefined);

  progress(onProgress, 'parsing', 'Parsing data…', 50);
  const parsedStudents    = parseStudents(studentRows);
  const parsedAttendance  = parseAttendance(attendanceRows);
  const parsedAssignments = parseAssignments(assignmentRows);
  const parsedQuiz        = parseQuiz(quizRows);

  const db = createServiceClient(cfg.serviceRoleKey);

  progress(onProgress, 'upserting_students', `Upserting ${parsedStudents.data.length} students…`, 58);
  const studentsResult = await upsertStudents(db, parsedStudents.data);

  progress(onProgress, 'upserting_attendance', `Upserting ${parsedAttendance.data.length} attendance records…`, 68);
  const attendanceResult = await upsertAttendance(db, parsedAttendance.data);

  progress(onProgress, 'upserting_assignments', `Upserting ${parsedAssignments.data.length} assignment submissions…`, 78);
  const assignmentsResult = await upsertAssignments(db, parsedAssignments.data);

  progress(onProgress, 'upserting_quiz', `Upserting ${parsedQuiz.data.length} quiz results…`, 88);
  const quizResult = await upsertQuiz(db, parsedQuiz.data);

  progress(onProgress, 'finalizing', 'Writing sync log…', 95);

  const allErrors = [
    ...parsedStudents.errors,
    ...parsedAttendance.errors,
    ...parsedAssignments.errors,
    ...parsedQuiz.errors,
    ...studentsResult.errors,
    ...attendanceResult.errors,
    ...assignmentsResult.errors,
    ...quizResult.errors,
  ];

  const totalInserted = studentsResult.inserted + attendanceResult.inserted + assignmentsResult.inserted + quizResult.inserted;
  const totalUpdated  = studentsResult.updated  + attendanceResult.updated  + assignmentsResult.updated  + quizResult.updated;
  const totalFailed   = studentsResult.failed   + attendanceResult.failed   + assignmentsResult.failed   + quizResult.failed;

  const status = totalFailed > 0 && totalInserted + totalUpdated === 0 ? 'error'
    : totalFailed > 0 ? 'partial'
    : 'success';

  await writeSyncLog(db, status, totalInserted + totalUpdated, allErrors);

  progress(onProgress, 'done', `Sync complete — ${totalInserted} inserted, ${totalUpdated} updated${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`, 100);

  return {
    students:    { ...studentsResult,    errors: [...parsedStudents.errors,    ...studentsResult.errors] },
    attendance:  { ...attendanceResult,  errors: [...parsedAttendance.errors,  ...attendanceResult.errors] },
    assignments: { ...assignmentsResult, errors: [...parsedAssignments.errors, ...assignmentsResult.errors] },
    quiz:        { ...quizResult,        errors: [...parsedQuiz.errors,        ...quizResult.errors] },
    totalInserted,
    totalUpdated,
    totalFailed,
    durationMs: Date.now() - t0,
    source: 'onedrive',
  };
}

/* ── Manual file upload sync ────────────────────────────── */

export async function runUploadSync(
  file: File,
  cfg: Pick<SyncConfig, 'serviceRoleKey' | 'sheetNames'>,
  onProgress: ProgressCallback,
): Promise<SyncDetails> {
  const t0 = Date.now();

  progress(onProgress, 'parsing', 'Reading workbook…', 10);
  const parsed = await parseUploadedFile(file, cfg.sheetNames);

  progress(onProgress, 'parsing', 'Parsing complete', 30);

  const db = createServiceClient(cfg.serviceRoleKey);

  progress(onProgress, 'upserting_students', `Upserting ${parsed.students.data.length} students…`, 45);
  const studentsResult = await upsertStudents(db, parsed.students.data);

  progress(onProgress, 'upserting_attendance', `Upserting ${parsed.attendance.data.length} attendance records…`, 60);
  const attendanceResult = await upsertAttendance(db, parsed.attendance.data);

  progress(onProgress, 'upserting_assignments', `Upserting ${parsed.assignments.data.length} assignment submissions…`, 73);
  const assignmentsResult = await upsertAssignments(db, parsed.assignments.data);

  progress(onProgress, 'upserting_quiz', `Upserting ${parsed.quiz.data.length} quiz results…`, 86);
  const quizResult = await upsertQuiz(db, parsed.quiz.data);

  progress(onProgress, 'finalizing', 'Writing sync log…', 95);

  const allErrors = [
    ...parsed.students.errors, ...parsed.attendance.errors, ...parsed.assignments.errors, ...parsed.quiz.errors,
    ...studentsResult.errors, ...attendanceResult.errors, ...assignmentsResult.errors, ...quizResult.errors,
  ];

  const totalInserted = studentsResult.inserted + attendanceResult.inserted + assignmentsResult.inserted + quizResult.inserted;
  const totalUpdated  = studentsResult.updated  + attendanceResult.updated  + assignmentsResult.updated  + quizResult.updated;
  const totalFailed   = studentsResult.failed   + attendanceResult.failed   + assignmentsResult.failed   + quizResult.failed;

  const status = totalFailed > 0 && totalInserted + totalUpdated === 0 ? 'error'
    : totalFailed > 0 ? 'partial'
    : 'success';

  await writeSyncLog(db, status, totalInserted + totalUpdated, allErrors);

  progress(onProgress, 'done', `Upload sync complete — ${totalInserted} inserted, ${totalUpdated} updated.`, 100);

  return {
    students:    { ...studentsResult,    errors: [...parsed.students.errors,    ...studentsResult.errors] },
    attendance:  { ...attendanceResult,  errors: [...parsed.attendance.errors,  ...attendanceResult.errors] },
    assignments: { ...assignmentsResult, errors: [...parsed.assignments.errors, ...assignmentsResult.errors] },
    quiz:        { ...quizResult,        errors: [...parsed.quiz.errors,        ...quizResult.errors] },
    totalInserted,
    totalUpdated,
    totalFailed,
    durationMs: Date.now() - t0,
    source: 'upload',
  };
}

/* ── Fetch sync history from Supabase ───────────────────── */

export async function fetchSyncLogs(serviceRoleKey: string, limit = 20): Promise<SyncLog[]> {
  const db = createServiceClient(serviceRoleKey);
  const { data } = await db
    .from('sync_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as SyncLog[]).map(row => ({
    ...row,
    errors: typeof row.errors === 'string' ? JSON.parse(row.errors) : (row.errors ?? []),
  }));
}
