import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  parseStudents,
  parseAttendance,
  parseAssignments,
  parseQuiz,
} from '../src/services/excelParser';

/* ── Types ─────────────────────────────────────────────── */

interface SyncBody {
  /** Direct file ID — use this OR shareUrl */
  fileId?: string;
  driveId?: string;
  /** Full OneDrive / SharePoint sharing URL — auto-resolved to fileId + driveId */
  shareUrl?: string;
  sheetNames?: {
    students?: string;
    attendance?: string;
    assignments?: string;
    quiz?: string;
  };
}

interface SheetResult {
  rowsRead: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: { message: string; row?: number; field?: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = ReturnType<typeof createClient<any, any, any>>;

const DEV = process.env.NODE_ENV !== 'production';

/* ── Share URL encoder ──────────────────────────────────── */

function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url).toString('base64');
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

/* ── Microsoft Graph helpers ────────────────────────────── */

async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.AZURE_TENANT_ID!;
  const clientId     = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    if (DEV) console.error('[sync] token error:', err);
    throw new Error(
      `Azure token ${res.status}: ${err.error_description ?? err.error ?? res.statusText}`,
    );
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function resolveShareUrl(
  token: string,
  shareUrl: string,
): Promise<{ fileId: string; driveId: string }> {
  const encoded = encodeShareUrl(shareUrl);
  if (DEV) console.log('[sync] resolving share encoded:', encoded);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const body = await res.json() as Record<string, unknown>;
  if (DEV) console.log('[sync] resolve response:', JSON.stringify(body, null, 2));

  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(`Could not resolve sharing URL (${res.status}): ${msg}`);
  }

  const item = body as { id: string; parentReference?: { driveId?: string } };
  return { fileId: item.id, driveId: item.parentReference?.driveId ?? '' };
}

async function readSheetFromGraph(
  token: string,
  fileId: string,
  sheetName: string,
  driveId?: string,
): Promise<string[][]> {
  const base = driveId
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`;

  const enc = encodeURIComponent(sheetName);
  const res = await fetch(`${base}/workbook/worksheets/${enc}/usedRange`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(
      `Graph ${res.status} reading sheet "${sheetName}": ${err.error?.message ?? res.statusText}`,
    );
  }

  const data = await res.json() as { values?: (string | number | boolean | null)[][] };
  return (data.values ?? []).map(row =>
    row.map(c => (c === null || c === undefined ? '' : String(c).trim())),
  );
}

/* ── Supabase helpers ───────────────────────────────────── */

async function ensureRow(
  db: AnyDb,
  table: string,
  matchCol: string,
  matchVal: string,
  insertRow: Record<string, unknown>,
  extraFilters?: Record<string, string>,
): Promise<string | null> {
  if (!matchVal) return null;
  let q = db.from(table).select('id').eq(matchCol, matchVal);
  if (extraFilters) {
    for (const [k, v] of Object.entries(extraFilters)) q = q.eq(k, v);
  }
  const { data: existing } = await q.maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created } = await db.from(table).insert(insertRow).select('id').single();
  return (created as { id: string } | null)?.id ?? null;
}

async function upsertStudents(
  db: AnyDb,
  students: ReturnType<typeof parseStudents>['data'],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: students.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const collegeCache = new Map<string, string | null>();
  const programCache = new Map<string, string | null>();
  const cohortCache  = new Map<string, string | null>();

  for (const s of students) {
    try {
      const ck = `${s.college}::${s.state}`;
      if (!collegeCache.has(ck))
        collegeCache.set(ck, await ensureRow(db, 'colleges', 'name', s.college, { name: s.college, state: s.state }));
      if (!programCache.has(s.program))
        programCache.set(s.program, await ensureRow(db, 'programs', 'name', s.program, { name: s.program }));
      const cohortKey = `${s.cohort}::${s.program}`;
      if (!cohortCache.has(cohortKey)) {
        const programId = programCache.get(s.program);
        const cohortRow: Record<string, unknown> = { name: s.cohort };
        if (programId) cohortRow.program_id = programId;
        cohortCache.set(cohortKey, await ensureRow(db, 'cohorts', 'name', s.cohort, cohortRow));
      }

      const row: Record<string, unknown> = {
        student_id:         s.student_id,
        name:               s.name,
        email:              s.email,
        status:             s.status,
        college_id:         collegeCache.get(ck) ?? null,
        current_program_id: programCache.get(s.program) ?? null,
        current_cohort_id:  cohortCache.get(cohortKey) ?? null,
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
      result.errors.push({ message: String((err as Error).message) });
    }
  }
  return result;
}

async function upsertAttendance(
  db: AnyDb,
  records: ReturnType<typeof parseAttendance>['data'],
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
        result.errors.push({ message: `Student not found: ${rec.student_email}` });
        continue;
      }

      const cohortId = studentInfo.cohortId;
      const sessionKey = `${rec.session_date}::${cohortId ?? ''}`;
      if (!sessionCache.has(sessionKey)) {
        const sessionRow: Record<string, unknown> = { session_date: rec.session_date, duration_hours: rec.duration_hours };
        if (cohortId) sessionRow.cohort_id = cohortId;
        if (rec.session_name) sessionRow.name = rec.session_name;
        const extraFilters = cohortId ? { cohort_id: cohortId } : undefined;
        sessionCache.set(sessionKey, await ensureRow(db, 'sessions', 'session_date', rec.session_date, sessionRow, extraFilters));
      }
      const sessionId = sessionCache.get(sessionKey);
      if (!sessionId) { result.failed++; continue; }

      const row = {
        student_id:     studentInfo.id,
        session_id:     sessionId,
        attended:       rec.attended,
        hours_attended: rec.hours_attended !== undefined ? rec.hours_attended : (rec.attended ? rec.duration_hours : 0),
      };
      const { data: existing } = await db.from('attendance_records')
        .select('id').eq('student_id', studentInfo.id).eq('session_id', sessionId).maybeSingle();
      if (existing) {
        const { error } = await db.from('attendance_records').update(row).eq('id', (existing as { id: string }).id);
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

async function upsertAssignments(
  db: AnyDb,
  records: ReturnType<typeof parseAssignments>['data'],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const studentCache    = new Map<string, string | null>();
  const assignmentCache = new Map<string, string | null>();

  for (const rec of records) {
    try {
      if (!studentCache.has(rec.student_email)) {
        const { data } = await db.from('students').select('id').eq('email', rec.student_email).maybeSingle();
        studentCache.set(rec.student_email, (data as { id: string } | null)?.id ?? null);
      }
      const studentId = studentCache.get(rec.student_email);
      if (!studentId) {
        result.failed++;
        result.errors.push({ message: `Student not found: ${rec.student_email}` });
        continue;
      }

      if (!assignmentCache.has(rec.assignment_name)) {
        assignmentCache.set(
          rec.assignment_name,
          await ensureRow(db, 'assignments', 'name', rec.assignment_name, { name: rec.assignment_name, due_date: rec.due_date }),
        );
      }
      const assignmentId = assignmentCache.get(rec.assignment_name);
      if (!assignmentId) { result.failed++; continue; }

      const row: Record<string, unknown> = { student_id: studentId, assignment_id: assignmentId, status: rec.status };
      if (rec.submitted_at) row.submitted_at = rec.submitted_at;

      const { data: existing } = await db.from('assignment_submissions')
        .select('id').eq('student_id', studentId).eq('assignment_id', assignmentId).maybeSingle();
      if (existing) {
        const { error } = await db.from('assignment_submissions').update(row).eq('id', (existing as { id: string }).id);
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

async function upsertQuiz(
  db: AnyDb,
  records: ReturnType<typeof parseQuiz>['data'],
): Promise<SheetResult> {
  const result: SheetResult = { rowsRead: records.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const studentCache = new Map<string, string | null>();
  const quizCache    = new Map<string, string | null>();

  for (const rec of records) {
    try {
      if (!studentCache.has(rec.student_email)) {
        const { data } = await db.from('students').select('id').eq('email', rec.student_email).maybeSingle();
        studentCache.set(rec.student_email, (data as { id: string } | null)?.id ?? null);
      }
      const studentId = studentCache.get(rec.student_email);
      if (!studentId) {
        result.failed++;
        result.errors.push({ message: `Student not found: ${rec.student_email}` });
        continue;
      }

      const quizKey = `${rec.quiz_name}::${rec.quiz_date}`;
      if (!quizCache.has(quizKey))
        quizCache.set(quizKey, await ensureRow(db, 'quizzes', 'name', rec.quiz_name, { name: rec.quiz_name, date: rec.quiz_date }));
      const quizId = quizCache.get(quizKey);
      if (!quizId) { result.failed++; continue; }

      const row = { student_id: studentId, quiz_id: quizId, score: rec.score, percentage: rec.percentage, taken_at: rec.quiz_date };
      const { data: existing } = await db.from('quiz_results')
        .select('id').eq('student_id', studentId).eq('quiz_id', quizId).maybeSingle();
      if (existing) {
        const { error } = await db.from('quiz_results').update(row).eq('id', (existing as { id: string }).id);
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

async function writeSyncLog(
  db: AnyDb,
  status: string,
  recordsUpdated: number,
  errors: unknown[],
): Promise<void> {
  try {
    await db.from('sync_logs').insert({
      status,
      records_updated: recordsUpdated,
      errors:          JSON.stringify(errors.slice(0, 50)),
      run_at:          new Date().toISOString(),
    });
  } catch {
    // non-critical — don't let a log failure break the sync response
  }
}

/* ── Main handler ───────────────────────────────────────── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const missing = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL']
    .filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({
      error: `Missing server environment variables: ${missing.join(', ')}. Set them in Vercel → Project → Settings → Environment Variables.`,
    });
  }

  const body = req.body as SyncBody;

  const sheetNames = {
    students:    body?.sheetNames?.students    ?? 'Student Master',
    attendance:  body?.sheetNames?.attendance  ?? 'Attendance',
    assignments: body?.sheetNames?.assignments ?? 'Assignments',
    quiz:        body?.sheetNames?.quiz        ?? 'Quiz',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: AnyDb = createClient<any, any, any>(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const t0 = Date.now();

  try {
    // 1. Get Graph access token
    const token = await getGraphToken();

    // 2. Resolve file location
    //    Priority: body.shareUrl → body.fileId → env ONEDRIVE_SHARE_URL → env ONEDRIVE_FILE_ID
    let fileId  = body?.fileId  ?? (process.env.ONEDRIVE_FILE_ID  ?? '');
    let driveId = (body?.driveId ?? process.env.ONEDRIVE_DRIVE_ID ?? '') || undefined;

    const shareUrlToResolve = body?.shareUrl?.trim() || process.env.ONEDRIVE_SHARE_URL?.trim() || '';

    if (shareUrlToResolve && !fileId) {
      if (DEV) console.log('[sync] resolving shareUrl...');
      const resolved = await resolveShareUrl(token, shareUrlToResolve);
      fileId  = resolved.fileId;
      driveId = resolved.driveId || undefined;
      if (DEV) console.log('[sync] resolved:', { fileId, driveId });
    }

    if (!fileId) {
      return res.status(400).json({
        error: 'Provide either shareUrl (OneDrive sharing link) or fileId in the request body, or set ONEDRIVE_SHARE_URL / ONEDRIVE_FILE_ID as environment variables.',
      });
    }

    // 3. Read all four sheets in parallel
    if (DEV) console.log('[sync] reading sheets from', { fileId, driveId });
    const [studentRows, attendanceRows, assignmentRows, quizRows] = await Promise.all([
      readSheetFromGraph(token, fileId, sheetNames.students,    driveId),
      readSheetFromGraph(token, fileId, sheetNames.attendance,  driveId),
      readSheetFromGraph(token, fileId, sheetNames.assignments, driveId),
      readSheetFromGraph(token, fileId, sheetNames.quiz,        driveId),
    ]);
    if (DEV) console.log('[sync] rows read:', { students: studentRows.length, attendance: attendanceRows.length, assignments: assignmentRows.length, quiz: quizRows.length });

    // 4. Parse
    const { data: students,    errors: eStudents    } = parseStudents(studentRows);
    const { data: attendance,  errors: eAttendance  } = parseAttendance(attendanceRows);
    const { data: assignments, errors: eAssignments } = parseAssignments(assignmentRows);
    const { data: quiz,        errors: eQuiz        } = parseQuiz(quizRows);

    // 5. Upsert sequentially to avoid connection pool exhaustion
    const sr  = await upsertStudents(db, students);
    const ar  = await upsertAttendance(db, attendance);
    const asr = await upsertAssignments(db, assignments);
    const qr  = await upsertQuiz(db, quiz);

    const totalInserted = sr.inserted + ar.inserted + asr.inserted + qr.inserted;
    const totalUpdated  = sr.updated  + ar.updated  + asr.updated  + qr.updated;
    const totalFailed   = sr.failed   + ar.failed   + asr.failed   + qr.failed;
    const allErrors     = [...eStudents, ...eAttendance, ...eAssignments, ...eQuiz, ...sr.errors, ...ar.errors, ...asr.errors, ...qr.errors];

    const status = (totalFailed > 0 && totalInserted + totalUpdated === 0) ? 'error'
      : totalFailed > 0 ? 'partial'
      : 'success';

    await writeSyncLog(db, status, totalInserted + totalUpdated, allErrors);

    return res.status(200).json({
      status,
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
      errors: allErrors.slice(0, 20),
      ...(DEV ? { resolvedFileId: fileId, resolvedDriveId: driveId } : {}),
    });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (DEV) console.error('[sync] fatal:', message);
    await writeSyncLog(db, 'error', 0, [{ message }]);
    return res.status(500).json({ error: message });
  }
}

export const config = { maxDuration: 120 };
