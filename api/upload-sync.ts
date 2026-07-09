/**
 * POST /api/upload-sync
 * Receives pre-parsed Excel data from the browser, upserts into Supabase in batches.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type {
  ParsedStudent,
  ParsedAttendance,
  ParsedAssignment,
  ParsedQuiz,
} from '../src/types/syncTypes';

// vercel dev runs functions in a separate worker — .env.local is not auto-injected
try {
  const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* production: .env.local absent, vars come from Vercel dashboard */ }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = ReturnType<typeof createClient<any, any, any>>;

interface SheetResult {
  rowsRead: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: { message: string; row?: number }[];
}

interface UploadBody {
  cohortName?:  string;
  students?:    ParsedStudent[];
  attendance?:  ParsedAttendance[];
  assignments?: ParsedAssignment[];
  quiz?:        ParsedQuiz[];
}

const CHUNK = 500;

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Fetch id→value map for a column in batches. Throws if the query itself errors. */
async function batchGetIds(
  db: AnyDb,
  table: string,
  col: string,
  vals: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(vals.filter(Boolean))];
  for (const c of chunks(unique, CHUNK)) {
    const { data, error } = await db.from(table).select(`id, ${col}`).in(col, c);
    if (error) throw new Error(`Lookup failed on ${table}.${col}: ${error.message}`);
    for (const r of (data ?? []) as unknown as { id: string; [k: string]: string }[]) map.set(r[col], r.id);
  }
  return map;
}

/**
 * Ensure a reference row exists without relying on onConflict constraints.
 * Selects by (col = val) plus any extraFilters; inserts insertData if not found.
 * Throws descriptive errors so callers know exactly what failed.
 */
async function ensureRow(
  db: AnyDb,
  table: string,
  col: string,
  val: string,
  insertData: Record<string, unknown>,
  extraFilters?: Record<string, string>,
  updateData?: Record<string, unknown>,
): Promise<string> {
  let q = db.from(table).select('id').eq(col, val);
  if (extraFilters) {
    for (const [k, v] of Object.entries(extraFilters)) q = q.eq(k, v);
  }
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw new Error(`${table} lookup failed (${col}="${val}"): ${selErr.message}`);
  if (existing) {
    const id = (existing as { id: string }).id;
    if (updateData) await db.from(table).update(updateData).eq('id', id);
    return id;
  }

  const { data: created, error: insErr } = await db
    .from(table).insert(insertData).select('id').single();
  if (insErr) throw new Error(`${table} insert failed (${col}="${val}"): ${insErr.message}`);
  if (!created) throw new Error(`${table} insert returned no row (${col}="${val}")`);
  return (created as { id: string }).id;
}

/* ── Sheet processors (batch) ─────────────────────────────── */

async function upsertStudents(db: AnyDb, students: ParsedStudent[]): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: students.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  if (!students.length) return result;

  try {
    // 1. Batch upsert reference tables
    const collegeRows = [...new Map(
      students.filter(s => s.college).map(s => [s.college, { name: s.college, state: s.state }])
    ).values()];
    if (collegeRows.length) await db.from('colleges').upsert(collegeRows, { onConflict: 'name', ignoreDuplicates: true });

    const programRows = [...new Set(students.map(s => s.program).filter(Boolean))].map(name => ({ name }));
    if (programRows.length) await db.from('programs').upsert(programRows, { onConflict: 'name', ignoreDuplicates: true });

    // 2. Fetch reference IDs
    const collegeMap = await batchGetIds(db, 'colleges', 'name', students.map(s => s.college));
    const programMap = await batchGetIds(db, 'programs', 'name', students.map(s => s.program));

    // Ensure each cohort exists (select-then-insert avoids onConflict constraint dependency)
    const cohortByName = new Map<string, { name: string; program_id: string | null }>();
    for (const s of students) {
      if (s.cohort && !cohortByName.has(s.cohort))
        cohortByName.set(s.cohort, { name: s.cohort, program_id: programMap.get(s.program) ?? null });
    }
    for (const [name, row] of cohortByName) await ensureRow(db, 'cohorts', 'name', name, row);
    const cohortMap = await batchGetIds(db, 'cohorts', 'name', students.map(s => s.cohort));

    // 3. Pre-query existing emails (for insert vs update counts)
    const emails = students.map(s => s.email).filter(Boolean);
    const existingEmails = new Set<string>();
    for (const c of chunks(emails, CHUNK)) {
      const { data } = await db.from('students').select('email').in('email', c);
      for (const r of (data ?? []) as { email: string }[]) existingEmails.add(r.email);
    }

    // 4. Batch upsert students
    const rows = students.map(s => ({
      student_id: s.student_id, name: s.name, email: s.email, status: s.status,
      college_id:         collegeMap.get(s.college) ?? null,
      current_program_id: programMap.get(s.program) ?? null,
      current_cohort_id:  cohortMap.get(s.cohort) ?? null,
      ...(s.enrollment_date    ? { enrollment_date:    s.enrollment_date    } : {}),
      ...(s.certificate_status ? { certificate_status: s.certificate_status } : {}),
    }));

    for (const c of chunks(rows, CHUNK)) {
      const { error } = await db.from('students').upsert(c, { onConflict: 'email' });
      if (error) {
        result.failed += c.length;
        result.errors.push({ message: error.message });
      } else {
        for (const r of c) {
          if (existingEmails.has(r.email)) result.updated++; else result.inserted++;
        }
      }
    }
  } catch (err) {
    result.failed = result.rowsRead;
    result.errors.push({ message: (err as Error).message });
  }
  return result;
}

async function upsertAttendance(db: AnyDb, records: ParsedAttendance[], cohortId: string | null): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  if (!records.length) return result;

  try {
    const studentMap = await batchGetIds(db, 'students', 'email', records.map(r => r.student_email));

    // Collect unique session info per date
    const sessionInfoByDate = new Map<string, { duration_hours: number }>();
    for (const r of records) {
      if (r.session_date && !sessionInfoByDate.has(r.session_date))
        sessionInfoByDate.set(r.session_date, { duration_hours: r.duration_hours });
    }
    if (!cohortId) {
      result.failed = records.length;
      result.errors.push({ message: 'Cannot create sessions: cohort not found — ensure students were imported first' });
      return result;
    }
    // Ensure each session exists, scoped to cohort (session_date + cohort_id); update duration on re-import
    const sessionMap = new Map<string, string>();
    for (const [date, info] of sessionInfoByDate) {
      const id = await ensureRow(
        db, 'sessions', 'session_date', date,
        { session_date: date, duration_hours: info.duration_hours, cohort_id: cohortId },
        { cohort_id: cohortId },
        { duration_hours: info.duration_hours },
      );
      sessionMap.set(date, id);
    }

    const valid: Record<string, unknown>[] = [];
    for (const rec of records) {
      const studentId = studentMap.get(rec.student_email);
      const sessionId = sessionMap.get(rec.session_date);
      if (!studentId) { result.failed++; result.errors.push({ message: `Student not found: ${rec.student_email}` }); continue; }
      if (!sessionId) { result.failed++; result.errors.push({ message: `Session not found for date: ${rec.session_date}` }); continue; }
      // Use hours_attended if provided (wide-format sentinel); fall back to duration_hours when attended
      const hoursAttended = rec.hours_attended !== undefined
        ? rec.hours_attended
        : (rec.attended ? rec.duration_hours : 0);
      valid.push({ student_id: studentId, session_id: sessionId, attended: rec.attended, hours_attended: hoursAttended });
    }

    // Pre-query existing keys
    const studentIds = [...new Set(valid.map(r => r.student_id as string))];
    const existingKeys = new Set<string>();
    for (const c of chunks(studentIds, CHUNK)) {
      const { data } = await db.from('attendance_records').select('student_id, session_id').in('student_id', c);
      for (const r of (data ?? []) as { student_id: string; session_id: string }[])
        existingKeys.add(`${r.student_id}::${r.session_id}`);
    }

    for (const c of chunks(valid, CHUNK)) {
      const { error } = await db.from('attendance_records').upsert(c, { onConflict: 'student_id,session_id' });
      if (error) {
        result.failed += c.length;
        result.errors.push({ message: error.message });
      } else {
        for (const r of c) {
          if (existingKeys.has(`${r.student_id}::${r.session_id}`)) result.updated++; else result.inserted++;
        }
      }
    }
  } catch (err) {
    result.failed = result.rowsRead;
    result.errors.push({ message: (err as Error).message });
  }
  return result;
}

async function upsertAssignments(db: AnyDb, records: ParsedAssignment[], cohortId: string | null): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  if (!records.length) return result;

  try {
    if (!cohortId) {
      result.failed = records.length;
      result.errors.push({ message: 'Cannot create assignments: cohort not found — ensure students were imported first' });
      return result;
    }

    const studentMap = await batchGetIds(db, 'students', 'email', records.map(r => r.student_email));

    // Ensure each assignment definition exists, scoped to cohort (name + cohort_id)
    const assignMap = new Map<string, string>();
    const uniqueAssignments = new Map(records.map(r => [r.assignment_name, r.due_date]));
    for (const [name, due_date] of uniqueAssignments) {
      const id = await ensureRow(
        db, 'assignments', 'name', name,
        { name, due_date, cohort_id: cohortId },
        { cohort_id: cohortId },
      );
      assignMap.set(name, id);
    }

    const valid: Record<string, unknown>[] = [];
    for (const rec of records) {
      const studentId  = studentMap.get(rec.student_email);
      const assignmentId = assignMap.get(rec.assignment_name);
      if (!studentId)    { result.failed++; result.errors.push({ message: `Student not found: ${rec.student_email}` }); continue; }
      if (!assignmentId) { result.failed++; result.errors.push({ message: `Assignment not found: ${rec.assignment_name}` }); continue; }
      valid.push({
        student_id: studentId, assignment_id: assignmentId, status: rec.status,
        ...(rec.submitted_at ? { submitted_at: rec.submitted_at } : {}),
      });
    }

    // Pre-query existing keys
    const studentIds = [...new Set(valid.map(r => r.student_id as string))];
    const existingKeys = new Set<string>();
    for (const c of chunks(studentIds, CHUNK)) {
      const { data } = await db.from('assignment_submissions').select('student_id, assignment_id').in('student_id', c);
      for (const r of (data ?? []) as { student_id: string; assignment_id: string }[])
        existingKeys.add(`${r.student_id}::${r.assignment_id}`);
    }

    for (const c of chunks(valid, CHUNK)) {
      const { error } = await db.from('assignment_submissions').upsert(c, { onConflict: 'student_id,assignment_id' });
      if (error) {
        result.failed += c.length;
        result.errors.push({ message: error.message });
      } else {
        for (const r of c) {
          if (existingKeys.has(`${r.student_id}::${r.assignment_id}`)) result.updated++; else result.inserted++;
        }
      }
    }
  } catch (err) {
    result.failed = result.rowsRead;
    result.errors.push({ message: (err as Error).message });
  }
  return result;
}

async function upsertQuiz(db: AnyDb, records: ParsedQuiz[], cohortId: string | null): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  if (!records.length) return result;

  try {
    if (!cohortId) {
      result.failed = records.length;
      result.errors.push({ message: 'Cannot create quizzes: cohort not found — ensure students were imported first' });
      return result;
    }

    const studentMap = await batchGetIds(db, 'students', 'email', records.map(r => r.student_email));

    // Ensure each quiz definition exists, scoped to cohort (name + cohort_id)
    const quizMap = new Map<string, string>();
    const uniqueQuizzes = new Map(records.map(r => [r.quiz_name, r.quiz_date]));
    for (const [name, date] of uniqueQuizzes) {
      const id = await ensureRow(
        db, 'quizzes', 'name', name,
        { name, date, cohort_id: cohortId },
        { cohort_id: cohortId },
      );
      quizMap.set(name, id);
    }

    const valid: Record<string, unknown>[] = [];
    for (const rec of records) {
      const studentId = studentMap.get(rec.student_email);
      const quizId    = quizMap.get(rec.quiz_name);
      if (!studentId) { result.failed++; result.errors.push({ message: `Student not found: ${rec.student_email}` }); continue; }
      if (!quizId)    { result.failed++; result.errors.push({ message: `Quiz not found: ${rec.quiz_name}` }); continue; }
      valid.push({ student_id: studentId, quiz_id: quizId, score: rec.score, percentage: rec.percentage, taken_at: rec.quiz_date });
    }

    // Pre-query existing keys
    const studentIds = [...new Set(valid.map(r => r.student_id as string))];
    const existingKeys = new Set<string>();
    for (const c of chunks(studentIds, CHUNK)) {
      const { data } = await db.from('quiz_results').select('student_id, quiz_id').in('student_id', c);
      for (const r of (data ?? []) as { student_id: string; quiz_id: string }[])
        existingKeys.add(`${r.student_id}::${r.quiz_id}`);
    }

    for (const c of chunks(valid, CHUNK)) {
      const { error } = await db.from('quiz_results').upsert(c, { onConflict: 'student_id,quiz_id' });
      if (error) {
        result.failed += c.length;
        result.errors.push({ message: error.message });
      } else {
        for (const r of c) {
          if (existingKeys.has(`${r.student_id}::${r.quiz_id}`)) result.updated++; else result.inserted++;
        }
      }
    }
  } catch (err) {
    result.failed = result.rowsRead;
    result.errors.push({ message: (err as Error).message });
  }
  return result;
}

async function upsertImportedEngagementMetrics(
  db: AnyDb,
  students: ParsedStudent[],
): Promise<void> {
  const withMetrics = students.filter(
    s =>
      s.imported_attendance_pct !== undefined ||
      s.imported_assignment_pct !== undefined ||
      s.imported_quiz_pct !== undefined,
  );
  if (!withMetrics.length) return;

  const studentMap = await batchGetIds(db, 'students', 'email', withMetrics.map(s => s.email));
  const calculatedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const s of withMetrics) {
    const studentId = studentMap.get(s.email);
    if (!studentId) continue;

    const att = s.imported_attendance_pct ?? 0;
    const asn = s.imported_assignment_pct ?? 0;
    const qz = s.imported_quiz_pct ?? 0;
    const engagement = Math.round(att * 0.4 + asn * 0.3 + qz * 0.3);
    let category = 'At Risk';
    if (engagement >= 90) category = 'Excellent';
    else if (engagement >= 75) category = 'Good';
    else if (engagement >= 60) category = 'Needs Attention';

    rows.push({
      student_id: studentId,
      attendance_percentage: att,
      assignment_completion: asn,
      quiz_performance: qz,
      engagement_score: engagement,
      category,
      calculated_at: calculatedAt,
    });
  }

  if (!rows.length) return;

  for (const c of chunks(rows, CHUNK)) {
    const { error } = await db.from('engagement_metrics').upsert(c, {
      onConflict: 'student_id,calculated_at',
    });
    if (error) {
      // Table or constraint may be missing on older DBs — non-fatal
      console.warn('engagement_metrics upsert:', error.message);
    }
  }
}

async function ensureCohortByName(db: AnyDb, cohortName: string): Promise<string | null> {
  const name = cohortName.trim();
  if (!name) return null;

  const { data: existing } = await db.from('cohorts').select('id').eq('name', name).maybeSingle();
  if (existing) return (existing as { id: string }).id;

  // Ensure a default program exists for cohort FK
  const defaultProgram = 'General';
  await db.from('programs').upsert({ name: defaultProgram }, { onConflict: 'name', ignoreDuplicates: true });
  const programMap = await batchGetIds(db, 'programs', 'name', [defaultProgram]);
  const programId = programMap.get(defaultProgram);
  if (!programId) return null;

  try {
    return await ensureRow(db, 'cohorts', 'name', name, { name, program_id: programId });
  } catch {
    const { data: retry } = await db.from('cohorts').select('id').eq('name', name).maybeSingle();
    return (retry as { id: string } | null)?.id ?? null;
  }
}

async function refreshPerformanceSummary(db: AnyDb): Promise<void> {
  const { error } = await db.rpc('refresh_student_performance_summary');
  if (error) {
    console.warn('refresh_student_performance_summary:', error.message);
  }
}

/* ── Handler ────────────────────────────────────────────── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL'].filter(k => !process.env[k]);
  if (missing.length)
    return res.status(500).json({
      error: `Missing env vars: ${missing.join(', ')}. ` +
        'For local dev run "npm run dev:api". ' +
        'For production set these in Vercel Dashboard → Project → Settings → Environment Variables, then redeploy.',
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: AnyDb = createClient<any, any, any>(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const body = req.body as UploadBody;
  const t0 = Date.now();

  try {
    const cohortLabel = (body.cohortName ?? body.students?.[0]?.cohort ?? '').trim();
    const studentsInput: ParsedStudent[] = (body.students ?? []).map(s => ({
      ...s,
      cohort: (s.cohort || cohortLabel).trim(),
    }));

    const sr = await upsertStudents(db, studentsInput);

    let resolvedCohortId: string | null = null;
    if (cohortLabel) {
      resolvedCohortId = await ensureCohortByName(db, cohortLabel);
      if (!resolvedCohortId) {
        const { data: cData } = await db.from('cohorts').select('id').eq('name', cohortLabel).maybeSingle();
        resolvedCohortId = (cData as { id: string } | null)?.id ?? null;
      }
    }

    const ar  = await upsertAttendance(db,  body.attendance  ?? [], resolvedCohortId);
    const asr = await upsertAssignments(db, body.assignments ?? [], resolvedCohortId);
    const qr  = await upsertQuiz(db,        body.quiz        ?? [], resolvedCohortId);

    await upsertImportedEngagementMetrics(db, studentsInput);

    const totalInserted = sr.inserted + ar.inserted + asr.inserted + qr.inserted;
    const totalUpdated  = sr.updated  + ar.updated  + asr.updated  + qr.updated;
    const totalFailed   = sr.failed   + ar.failed   + asr.failed   + qr.failed;
    const rawErrors     = [...sr.errors, ...ar.errors, ...asr.errors, ...qr.errors];

    // Deduplicate repeated error messages — show each unique message once with a row count
    const errCounts = new Map<string, number>();
    for (const e of rawErrors) errCounts.set(e.message, (errCounts.get(e.message) ?? 0) + 1);
    const allErrors = [...errCounts.entries()].map(([message, count]) => ({
      message: count > 1 ? `${message} (${count} rows)` : message,
    }));

    const status = totalFailed > 0 && totalInserted + totalUpdated === 0 ? 'error'
      : totalFailed > 0 ? 'partial' : 'success';

    try {
      await db.from('sync_logs').insert({
        status,
        records_updated: totalInserted + totalUpdated,
        errors: JSON.stringify(allErrors.slice(0, 50)),
        run_at: new Date().toISOString(),
      });
    } catch { /* non-critical */ }

    if (status !== 'error') {
      await refreshPerformanceSummary(db);
    }

    return res.status(200).json({
      status,
      cohortName: cohortLabel || null,
      durationMs: Date.now() - t0,
      totalInserted,
      totalUpdated,
      totalFailed,
      sheets: {
        students:    { rowsRead: sr.rowsRead,  inserted: sr.inserted,  updated: sr.updated,  failed: sr.failed  },
        attendance:  { rowsRead: ar.rowsRead,  inserted: ar.inserted,  updated: ar.updated,  failed: ar.failed  },
        assignments: { rowsRead: asr.rowsRead, inserted: asr.inserted, updated: asr.updated, failed: asr.failed },
        quiz:        { rowsRead: qr.rowsRead,  inserted: qr.inserted,  updated: qr.updated,  failed: qr.failed  },
      },
      errors: allErrors.slice(0, 50),
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '10mb' } }, maxDuration: 60 };
