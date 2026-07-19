import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLatestCohortPayloadAny } from './latestCohortPayload.js';
import {
  buildReminderEmail,
  buildStudentReminderSnapshot,
  DEFAULT_REMINDER_THRESHOLDS,
  listStudentsNeedingReminders,
  reminderLogKey,
  resolveReminderSlot,
  type ReminderSlot,
  type ReminderThresholds,
  type StudentReminderSnapshot,
  type ReminderPayload,
  type StudentReminderReason,
  isValidStudentEmail,
} from './studentReminderMetricsServer.js';

export interface ReminderRunResult {
  weekKey: string;
  slot: ReminderSlot | 'pilot';
  cohortName: string;
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  dryRun: boolean;
  batchOffset: number;
  batchLimit: number | null;
  processed: number;
  remaining: number;
  autoContinue: boolean;
  chainQueued: boolean;
  errors: Array<{ email: string; message: string }>;
}

function reminderThresholdsFromEnv(): ReminderThresholds {
  const attendanceBelow = Number(process.env.REMINDER_ATTENDANCE_BELOW ?? DEFAULT_REMINDER_THRESHOLDS.attendanceBelow);
  const quizBelow = Number(process.env.REMINDER_QUIZ_BELOW ?? DEFAULT_REMINDER_THRESHOLDS.quizBelow);
  return {
    attendanceBelow: Number.isFinite(attendanceBelow) ? attendanceBelow : DEFAULT_REMINDER_THRESHOLDS.attendanceBelow,
    quizBelow: Number.isFinite(quizBelow) ? quizBelow : DEFAULT_REMINDER_THRESHOLDS.quizBelow,
  };
}

async function loadAlreadySentEmails(
  db: SupabaseClient,
  weekKey: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from('student_reminder_logs')
    .select('student_email')
    .eq('week_key', weekKey);

  if (error) {
    if (error.code === '42P01') return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map(row => String(row.student_email).toLowerCase()));
}

async function logReminderSent(
  db: SupabaseClient,
  snapshot: StudentReminderSnapshot,
  weekKey: string,
  cohortName: string,
): Promise<void> {
  const { error } = await db.from('student_reminder_logs').insert({
    student_email: snapshot.email.toLowerCase(),
    student_name: snapshot.name,
    week_key: weekKey,
    cohort_name: cohortName,
    reasons: snapshot.reasons,
    attendance_pct: snapshot.attendancePct,
    assignment_pct: snapshot.assignmentPct,
    avg_quiz: snapshot.avgQuiz,
  });
  if (error && error.code !== '42P01') throw new Error(error.message);
}

export async function runWeeklyStudentReminders(
  db: SupabaseClient,
  slotInput?: string,
  options?: {
    limit?: number;
    offset?: number;
    forceLive?: boolean;
    weekKeySuffix?: string;
    auto?: boolean;
    preview?: boolean;
  },
): Promise<ReminderRunResult> {
  const slot = resolveReminderSlot(slotInput);
  const weekKey = options?.weekKeySuffix
    ? `${reminderLogKey(slot).replace(/-(morning|evening)$/, '')}-${options.weekKeySuffix}`
    : reminderLogKey(slot);
  const dryRun = options?.preview
    ? true
    : options?.forceLive
      ? false
      : process.env.REMINDER_DRY_RUN === 'true';
  const usePendingQueue = options?.auto === true;
  const batchOffset = usePendingQueue ? 0 : Math.max(0, options?.offset ?? 0);
  const defaultBatchSize = Number(process.env.REMINDER_BATCH_SIZE ?? 25);
  const batchLimit = options?.limit && options.limit > 0
    ? options.limit
    : usePendingQueue && Number.isFinite(defaultBatchSize) && defaultBatchSize > 0
      ? defaultBatchSize
      : null;
  const dashboardUrl =
    process.env.STUDENT_DASHBOARD_URL?.trim()
    || 'https://open-cohort-vigyanshaala-performanc.vercel.app/student-view';

  const loaded = await fetchLatestCohortPayloadAny(db);
  if (!loaded?.payload) {
    return {
      weekKey,
      slot,
      cohortName: '—',
      candidates: 0,
      sent: 0,
      skippedAlreadySent: 0,
      failed: 0,
      dryRun,
      batchOffset,
      batchLimit,
      processed: 0,
      remaining: 0,
      autoContinue: usePendingQueue,
      chainQueued: false,
      errors: [{ email: '—', message: 'No active cohort workbook found' }],
    };
  }

  const thresholds = reminderThresholdsFromEnv();
  const allSnapshots = listStudentsNeedingReminders(loaded.payload as ReminderPayload, thresholds);
  const cohortName = loaded.meta.cohortName ?? loaded.payload.cohortName ?? 'Cohort';
  const candidates = allSnapshots.length;

  if (dryRun) {
    const sliceEnd = batchLimit ? batchOffset + batchLimit : undefined;
    const snapshots = allSnapshots.slice(batchOffset, sliceEnd);
    return {
      weekKey,
      slot,
      cohortName,
      candidates,
      sent: snapshots.length,
      skippedAlreadySent: 0,
      failed: 0,
      dryRun: true,
      batchOffset,
      batchLimit,
      processed: snapshots.length,
      remaining: Math.max(0, candidates - batchOffset - snapshots.length),
      autoContinue: usePendingQueue,
      chainQueued: false,
      errors: [],
    };
  }

  const alreadySent = await loadAlreadySentEmails(db, weekKey);
  const pending = allSnapshots.filter(s => !alreadySent.has(s.email.toLowerCase()));
  const snapshots = usePendingQueue
    ? pending.slice(0, batchLimit ?? 25)
    : allSnapshots.slice(batchOffset, batchLimit ? batchOffset + batchLimit : undefined);
  let sent = 0;
  let skippedAlreadySent = 0;
  let failed = 0;
  let processed = 0;
  const errors: Array<{ email: string; message: string }> = [];
  const startedAt = Date.now();
  const timeBudgetMs = 50_000;

  for (const snapshot of snapshots) {
    if (Date.now() - startedAt > timeBudgetMs) break;
    processed++;
    try {
      if (alreadySent.has(snapshot.email.toLowerCase())) {
        skippedAlreadySent++;
        continue;
      }

      if (!isValidStudentEmail(snapshot.email)) {
        failed++;
        errors.push({ email: snapshot.email, message: 'Invalid email — skipped' });
        continue;
      }

      const mail = buildReminderEmail(snapshot, dashboardUrl);
      const { sendGmailMessage } = await import('./gmailSender.js');
      await sendGmailMessage({ to: snapshot.email, ...mail });
      await logReminderSent(db, snapshot, weekKey, cohortName);
      sent++;
      await new Promise(r => setTimeout(r, 250));
    } catch (err) {
      failed++;
      errors.push({
        email: snapshot.email,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const remaining = usePendingQueue
    ? Math.max(0, pending.length - processed)
    : Math.max(0, candidates - batchOffset - processed);

  return {
    weekKey,
    slot,
    cohortName,
    candidates,
    sent,
    skippedAlreadySent,
    failed,
    dryRun,
    batchOffset,
    batchLimit,
    processed,
    remaining,
    autoContinue: usePendingQueue,
    chainQueued: false,
    errors,
  };
}

export async function runPilotStudentReminders(
  db: SupabaseClient,
  limit = 10,
): Promise<ReminderRunResult> {
  const pilotLimit = Math.min(Math.max(1, limit), 50);
  return runWeeklyStudentReminders(db, 'morning', {
    limit: pilotLimit,
    offset: 0,
    forceLive: true,
    weekKeySuffix: 'pilot',
  });
}

export interface ReminderTestResult {
  ok: boolean;
  test: true;
  sentTo: string;
  sampleStudentEmail: string;
  sampleStudentName: string;
  reasons: StudentReminderReason[];
  subject: string;
  dryRunIgnored: true;
  logged: false;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Send one real preview email; does not respect REMINDER_DRY_RUN or write dedupe logs. */
export async function runTestStudentReminder(
  db: SupabaseClient,
  options: { to: string; studentEmail?: string },
): Promise<ReminderTestResult> {
  const to = options.to.trim();
  if (!isValidEmail(to)) throw new Error('Invalid test recipient email (use ?to=your@email.com)');

  const dashboardUrl =
    process.env.STUDENT_DASHBOARD_URL?.trim()
    || 'https://open-cohort-vigyanshaala-performanc.vercel.app/student-view';

  const loaded = await fetchLatestCohortPayloadAny(db);
  if (!loaded?.payload) {
    throw new Error('No active cohort workbook found');
  }

  const thresholds = reminderThresholdsFromEnv();
  const payload = loaded.payload as ReminderPayload;
  let snapshot: StudentReminderSnapshot | null = null;

  if (options.studentEmail?.trim()) {
    snapshot = buildStudentReminderSnapshot(payload, options.studentEmail.trim(), thresholds);
  } else {
    const emails: string[] = [];
    for (const row of payload.rawRows ?? []) {
      for (const val of Object.values(row)) {
        const text = String(val ?? '').trim().toLowerCase();
        if (!text.includes('@') || text.endsWith('@edu.in')) continue;
        emails.push(text);
        break;
      }
      if (emails.length >= 40) break;
    }
    for (const email of emails) {
      const candidate = buildStudentReminderSnapshot(payload, email, thresholds);
      if (candidate && candidate.reasons.length > 0) {
        snapshot = candidate;
        break;
      }
    }
    if (!snapshot && emails[0]) {
      snapshot = buildStudentReminderSnapshot(payload, emails[0], thresholds);
    }
  }

  if (!snapshot) throw new Error('Could not build reminder preview for any student');

  const mail = buildReminderEmail(snapshot, dashboardUrl);
  const subject = `[TEST] ${mail.subject}`;
  const previewNote =
    `This is a test preview of the weekly nudge for ${snapshot.name} (${snapshot.email}).\n\n`;
  const text = previewNote + mail.text;
  const html = [
    `<p><em>This is a test preview of the weekly nudge for ${snapshot.name} (${snapshot.email}).</em></p>`,
    mail.html,
  ].join('\n');

  const { sendGmailMessage } = await import('./gmailSender.js');
  await sendGmailMessage({ to, subject, text, html });

  return {
    ok: true,
    test: true,
    sentTo: to,
    sampleStudentEmail: snapshot.email,
    sampleStudentName: snapshot.name,
    reasons: snapshot.reasons,
    subject,
    dryRunIgnored: true,
    logged: false,
  };
}
