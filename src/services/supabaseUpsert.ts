import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ParsedStudent,
  ParsedAttendance,
  ParsedAssignment,
  ParsedQuiz,
  SheetResult,
  SyncError,
} from '../types/syncTypes';

/* Create an elevated client that bypasses RLS */
export function createServiceClient(serviceRoleKey: string): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ── Lookup / ensure helpers ──────────────────────────── */

async function ensureCollege(db: SupabaseClient, name: string, state: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await db.from('colleges').select('id').eq('name', name).single();
  if (existing) return existing.id as string;
  const { data: created } = await db.from('colleges').insert({ name, state }).select('id').single();
  return (created as { id: string } | null)?.id ?? null;
}

async function ensureProgram(db: SupabaseClient, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await db.from('programs').select('id').eq('name', name).single();
  if (existing) return existing.id as string;
  const { data: created } = await db.from('programs').insert({ name }).select('id').single();
  return (created as { id: string } | null)?.id ?? null;
}

async function ensureCohort(db: SupabaseClient, name: string, programId?: string | null): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await db.from('cohorts').select('id').eq('name', name).single();
  if (existing) return existing.id as string;
  const row: Record<string, unknown> = { name };
  if (programId) row.program_id = programId;
  const { data: created } = await db.from('cohorts').insert(row).select('id').single();
  return (created as { id: string } | null)?.id ?? null;
}

async function ensureSession(
  db: SupabaseClient,
  sessionDate: string,
  durationHours: number,
  cohortId: string | null,
  sessionName?: string,
): Promise<string | null> {
  let q = db.from('sessions').select('id').eq('session_date', sessionDate);
  if (cohortId) q = q.eq('cohort_id', cohortId);
  const { data: existing } = await q.maybeSingle();
  if (existing) return existing.id as string;
  const row: Record<string, unknown> = { session_date: sessionDate, duration_hours: durationHours };
  if (cohortId) row.cohort_id = cohortId;
  if (sessionName) row.name = sessionName;
  const { data: created } = await db.from('sessions').insert(row).select('id').single();
  return (created as { id: string } | null)?.id ?? null;
}

async function ensureAssignmentRecord(
  db: SupabaseClient,
  name: string,
  dueDate: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from('assignments')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await db
    .from('assignments')
    .insert({ name, due_date: dueDate })
    .select('id')
    .single();
  return (created as { id: string } | null)?.id ?? null;
}

async function ensureQuizRecord(
  db: SupabaseClient,
  name: string,
  date: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from('quizzes')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await db
    .from('quizzes')
    .insert({ name, date })
    .select('id')
    .single();
  return (created as { id: string } | null)?.id ?? null;
}

/* ── Upsert students ──────────────────────────────────── */

export async function upsertStudents(
  db: SupabaseClient,
  students: ParsedStudent[],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: students.length, inserted: 0, updated: 0, failed: 0, errors: [] };

  // Cache lookups to reduce DB round-trips
  const collegeCache = new Map<string, string | null>();
  const programCache = new Map<string, string | null>();
  const cohortCache  = new Map<string, string | null>();

  for (const s of students) {
    try {
      const collegeKey = `${s.college}::${s.state}`;
      if (!collegeCache.has(collegeKey)) {
        collegeCache.set(collegeKey, await ensureCollege(db, s.college, s.state));
      }
      if (!programCache.has(s.program)) {
        programCache.set(s.program, await ensureProgram(db, s.program));
      }
      const cohortKey = `${s.cohort}::${s.program}`;
      if (!cohortCache.has(cohortKey)) {
        cohortCache.set(cohortKey, await ensureCohort(db, s.cohort, programCache.get(s.program)));
      }

      const row: Record<string, unknown> = {
        student_id: s.student_id,
        name: s.name,
        email: s.email,
        status: s.status,
        college_id:          collegeCache.get(collegeKey) ?? null,
        current_program_id:  programCache.get(s.program) ?? null,
        current_cohort_id:   cohortCache.get(cohortKey) ?? null,
      };
      if (s.enrollment_date) row.enrollment_date = s.enrollment_date;

      const { data: existing } = await db.from('students').select('id').eq('email', s.email).maybeSingle();

      if (existing) {
        const { error } = await db.from('students').update(row).eq('email', s.email);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await db.from('students').insert(row);
        if (error) throw error;
        result.inserted++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({ field: 'email', value: s.email, message: String((err as Error).message) });
    }
  }
  return result;
}

/* ── Upsert attendance ────────────────────────────────── */

export async function upsertAttendance(
  db: SupabaseClient,
  records: ParsedAttendance[],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const studentCache = new Map<string, { id: string; cohortId: string | null } | null>();
  const sessionCache = new Map<string, string | null>();

  for (const rec of records) {
    try {
      if (!studentCache.has(rec.student_email)) {
        const { data } = await db.from('students').select('id, current_cohort_id').eq('email', rec.student_email).maybeSingle();
        const s = data as { id: string; current_cohort_id: string | null } | null;
        studentCache.set(rec.student_email, s ? { id: s.id, cohortId: s.current_cohort_id ?? null } : null);
      }
      const studentInfo = studentCache.get(rec.student_email);
      if (!studentInfo?.id) {
        result.failed++;
        result.errors.push({ field: 'email', value: rec.student_email, message: `Student not found: ${rec.student_email}` });
        continue;
      }

      const cohortId = studentInfo.cohortId;
      const sessionKey = `${rec.session_date}::${cohortId ?? ''}`;
      if (!sessionCache.has(sessionKey)) {
        sessionCache.set(sessionKey, await ensureSession(db, rec.session_date, rec.duration_hours, cohortId, rec.session_name));
      }
      const sessionId = sessionCache.get(sessionKey);
      if (!sessionId) { result.failed++; continue; }

      const row = {
        student_id: studentInfo.id,
        session_id: sessionId,
        attended: rec.attended,
        hours_attended: rec.hours_attended !== undefined ? rec.hours_attended : (rec.attended ? rec.duration_hours : 0),
      };

      const { data: existing } = await db
        .from('attendance_records')
        .select('id')
        .eq('student_id', studentInfo.id)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (existing) {
        const { error } = await db.from('attendance_records').update(row).eq('id', (existing as {id:string}).id);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await db.from('attendance_records').insert(row);
        if (error) throw error;
        result.inserted++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({ message: String((err as Error).message) });
    }
  }
  return result;
}

/* ── Upsert assignments ───────────────────────────────── */

export async function upsertAssignments(
  db: SupabaseClient,
  records: ParsedAssignment[],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const studentCache    = new Map<string, string | null>();
  const assignmentCache = new Map<string, string | null>();

  for (const rec of records) {
    try {
      if (!studentCache.has(rec.student_email)) {
        const { data } = await db.from('students').select('id').eq('email', rec.student_email).maybeSingle();
        studentCache.set(rec.student_email, (data as {id:string}|null)?.id ?? null);
      }
      const studentId = studentCache.get(rec.student_email);
      if (!studentId) {
        result.failed++;
        result.errors.push({ field: 'email', value: rec.student_email, message: `Student not found: ${rec.student_email}` });
        continue;
      }

      if (!assignmentCache.has(rec.assignment_name)) {
        assignmentCache.set(rec.assignment_name, await ensureAssignmentRecord(db, rec.assignment_name, rec.due_date));
      }
      const assignmentId = assignmentCache.get(rec.assignment_name);
      if (!assignmentId) { result.failed++; continue; }

      const row: Record<string, unknown> = { student_id: studentId, assignment_id: assignmentId, status: rec.status };
      if (rec.submitted_at) row.submitted_at = rec.submitted_at;

      const { data: existing } = await db
        .from('assignment_submissions')
        .select('id')
        .eq('student_id', studentId)
        .eq('assignment_id', assignmentId)
        .maybeSingle();

      if (existing) {
        const { error } = await db.from('assignment_submissions').update(row).eq('id', (existing as {id:string}).id);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await db.from('assignment_submissions').insert(row);
        if (error) throw error;
        result.inserted++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({ message: String((err as Error).message) });
    }
  }
  return result;
}

/* ── Upsert quiz results ──────────────────────────────── */

export async function upsertQuiz(
  db: SupabaseClient,
  records: ParsedQuiz[],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const studentCache = new Map<string, string | null>();
  const quizCache    = new Map<string, string | null>();

  for (const rec of records) {
    try {
      if (!studentCache.has(rec.student_email)) {
        const { data } = await db.from('students').select('id').eq('email', rec.student_email).maybeSingle();
        studentCache.set(rec.student_email, (data as {id:string}|null)?.id ?? null);
      }
      const studentId = studentCache.get(rec.student_email);
      if (!studentId) {
        result.failed++;
        result.errors.push({ field: 'email', value: rec.student_email, message: `Student not found: ${rec.student_email}` });
        continue;
      }

      const quizKey = `${rec.quiz_name}::${rec.quiz_date}`;
      if (!quizCache.has(quizKey)) {
        quizCache.set(quizKey, await ensureQuizRecord(db, rec.quiz_name, rec.quiz_date));
      }
      const quizId = quizCache.get(quizKey);
      if (!quizId) { result.failed++; continue; }

      const row: Record<string, unknown> = {
        student_id: studentId,
        quiz_id:    quizId,
        score:      rec.score,
        percentage: rec.percentage,
        taken_at:   rec.quiz_date,
      };

      const { data: existing } = await db
        .from('quiz_results')
        .select('id')
        .eq('student_id', studentId)
        .eq('quiz_id', quizId)
        .maybeSingle();

      if (existing) {
        const { error } = await db.from('quiz_results').update(row).eq('id', (existing as {id:string}).id);
        if (error) throw error;
        result.updated++;
      } else {
        const { error } = await db.from('quiz_results').insert(row);
        if (error) throw error;
        result.inserted++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({ message: String((err as Error).message) });
    }
  }
  return result;
}

/* ── Write sync log ───────────────────────────────────── */

export async function writeSyncLog(
  db: SupabaseClient,
  status: 'running' | 'success' | 'error' | 'partial',
  recordsUpdated: number,
  errors: SyncError[],
): Promise<void> {
  try {
    await db.from('sync_logs').insert({
      status,
      records_updated: recordsUpdated,
      errors: JSON.stringify(errors.slice(0, 50)),
      run_at: new Date().toISOString(),
    });
  } catch {
    // sync_logs insert failed silently — not critical
  }
}
