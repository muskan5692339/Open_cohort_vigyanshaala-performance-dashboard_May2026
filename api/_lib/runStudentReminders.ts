import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLatestCohortPayloadAny } from './latestCohortPayload';
import {
  buildReminderEmail,
  DEFAULT_REMINDER_THRESHOLDS,
  listStudentsNeedingReminders,
  reminderLogKey,
  resolveReminderSlot,
  type ReminderSlot,
  type ReminderThresholds,
  type StudentReminderSnapshot,
} from '../../src/services/studentReminderMetrics';

export interface ReminderRunResult {
  weekKey: string;
  slot: ReminderSlot;
  cohortName: string;
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  dryRun: boolean;
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

async function wasReminderSentThisWeek(
  db: SupabaseClient,
  email: string,
  weekKey: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('student_reminder_logs')
    .select('id')
    .eq('student_email', email.toLowerCase())
    .eq('week_key', weekKey)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return false;
    throw new Error(error.message);
  }
  return Boolean(data);
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
): Promise<ReminderRunResult> {
  const slot = resolveReminderSlot(slotInput);
  const weekKey = reminderLogKey(slot);
  const dryRun = process.env.REMINDER_DRY_RUN === 'true';
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
      errors: [{ email: '—', message: 'No active cohort workbook found' }],
    };
  }

  const thresholds = reminderThresholdsFromEnv();
  const snapshots = listStudentsNeedingReminders(loaded.payload, thresholds);
  const cohortName = loaded.meta.cohortName ?? loaded.payload.cohortName ?? 'Cohort';

  let sent = 0;
  let skippedAlreadySent = 0;
  let failed = 0;
  const errors: Array<{ email: string; message: string }> = [];

  for (const snapshot of snapshots) {
    try {
      const already = await wasReminderSentThisWeek(db, snapshot.email, weekKey);
      if (already) {
        skippedAlreadySent++;
        continue;
      }

      const mail = buildReminderEmail(snapshot, dashboardUrl);
      if (!dryRun) {
        const { sendGmailMessage } = await import('./gmailSender');
        await sendGmailMessage({ to: snapshot.email, ...mail });
        await logReminderSent(db, snapshot, weekKey, cohortName);
      }
      sent++;
    } catch (err) {
      failed++;
      errors.push({
        email: snapshot.email,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    weekKey,
    slot,
    cohortName,
    candidates: snapshots.length,
    sent,
    skippedAlreadySent,
    failed,
    dryRun,
    errors,
  };
}
