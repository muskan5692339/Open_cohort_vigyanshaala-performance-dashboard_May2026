import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertOrgAccess, handleOrgAccessFailure, ORG_READ_ROLES } from './assertOrgAccess.js';
import { runWeeklyStudentReminders } from './runStudentReminders.js';
import { reminderLogKey } from './studentReminderMetricsServer.js';

const ROUTE = '/api/reminders?slot=status';

function istNowParts(): { day: string; hour: number; label: string } {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );
  const label = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  return { day, hour, label };
}

function nextScheduledSend(day: string, hour: number): { label: string; when: string } {
  if (day === 'Sun' && hour < 9) {
    return { label: 'Sunday weekly report', when: 'Today at 9:30 AM IST' };
  }
  if (day === 'Sun') {
    return { label: 'Wednesday mid-week report', when: 'Wednesday at 3:30 PM IST' };
  }
  if (day === 'Wed' && hour < 15) {
    return { label: 'Wednesday mid-week report', when: 'Today at 3:30 PM IST' };
  }
  if (day === 'Wed') {
    return { label: 'Sunday weekly report', when: 'Sunday at 9:30 AM IST' };
  }
  if (day === 'Mon' || day === 'Tue') {
    return { label: 'Wednesday mid-week report', when: 'Wednesday at 3:30 PM IST' };
  }
  return { label: 'Sunday weekly report', when: 'Sunday at 9:30 AM IST' };
}

function isMissingReminderTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('student_reminder_logs') && (m.includes('does not exist') || m.includes('not found') || m.includes('schema cache'));
}

async function buildStatusPayload(serviceDb: SupabaseClient) {
  const ist = istNowParts();
  const next = nextScheduledSend(ist.day, ist.hour);
  const sundayWeekKey = reminderLogKey('morning');
  const midweekWeekKey = `${sundayWeekKey.replace(/-(morning|evening)$/, '')}-midweek`;

  let previewCandidates = 0;
  let previewWouldEmail = 0;
  let cohortName = '—';
  let previewError: string | null = null;
  try {
    const preview = await runWeeklyStudentReminders(serviceDb, 'morning', { preview: true });
    previewCandidates = preview.candidates;
    previewWouldEmail = preview.sent;
    cohortName = preview.cohortName;
  } catch (e) {
    previewError = (e as Error).message;
  }

  const { data: recentRows, error: recentErr } = await serviceDb
    .from('student_reminder_logs')
    .select('student_email, student_name, week_key, reasons, attendance_pct, assignment_pct, avg_quiz, sent_at, cohort_name')
    .order('sent_at', { ascending: false })
    .limit(80);

  if (recentErr) {
    if (isMissingReminderTable(recentErr.message)) {
      return {
        ok: true,
        logsReady: false,
        istNow: ist.label,
        istDay: ist.day,
        nextSend: next,
        schedule: [
          { key: 'sunday', label: 'Sunday weekly report', when: '9:30 AM IST' },
          { key: 'wednesday', label: 'Wednesday mid-week report', when: '3:30 PM IST' },
        ],
        sundayWeekKey,
        midweekWeekKey,
        cohortName,
        eligibleNow: previewWouldEmail,
        activeCandidates: previewCandidates,
        previewError,
        sundaySentCount: 0,
        midweekSentCount: 0,
        lastSentAt: null,
        weekSummaries: [],
        recentSends: [],
        note: 'Run Supabase migration 014_student_reminder_logs.sql to store send history.',
      };
    }
    throw new Error(recentErr.message);
  }

  const rows = recentRows ?? [];
  const sundaySentCount = rows.filter(r => r.week_key === sundayWeekKey).length;
  const midweekSentCount = rows.filter(r => r.week_key === midweekWeekKey).length;
  const lastSentAt = rows[0]?.sent_at ?? null;

  const byWeek = new Map<string, { weekKey: string; sent: number; lastSentAt: string }>();
  for (const row of rows) {
    const key = String(row.week_key);
    const prev = byWeek.get(key);
    if (!prev) {
      byWeek.set(key, { weekKey: key, sent: 1, lastSentAt: row.sent_at });
    } else {
      prev.sent += 1;
      if (String(row.sent_at) > String(prev.lastSentAt)) prev.lastSentAt = row.sent_at;
    }
  }

  const weekSummaries = [...byWeek.values()]
    .sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt))
    .slice(0, 8);

  let sundayStatus: 'pending' | 'sending_window' | 'sent' | 'not_today' = 'not_today';
  if (ist.day === 'Sun') {
    if (sundaySentCount > 0) sundayStatus = 'sent';
    else if (ist.hour < 9) sundayStatus = 'pending';
    else sundayStatus = 'sending_window';
  }

  let wednesdayStatus: 'pending' | 'sending_window' | 'sent' | 'not_today' = 'not_today';
  if (ist.day === 'Wed') {
    if (midweekSentCount > 0) wednesdayStatus = 'sent';
    else if (ist.hour < 15) wednesdayStatus = 'pending';
    else wednesdayStatus = 'sending_window';
  }

  return {
    ok: true,
    logsReady: true,
    istNow: ist.label,
    istDay: ist.day,
    nextSend: next,
    schedule: [
      { key: 'sunday', label: 'Sunday weekly report', when: '9:30 AM IST', status: sundayStatus, sentCount: sundaySentCount, weekKey: sundayWeekKey },
      { key: 'wednesday', label: 'Wednesday mid-week report', when: '3:30 PM IST', status: wednesdayStatus, sentCount: midweekSentCount, weekKey: midweekWeekKey },
    ],
    sundayWeekKey,
    midweekWeekKey,
    cohortName,
    eligibleNow: previewWouldEmail,
    activeCandidates: previewCandidates,
    previewError,
    sundaySentCount,
    midweekSentCount,
    lastSentAt,
    weekSummaries,
    recentSends: rows.slice(0, 40).map(r => ({
      email: r.student_email,
      name: r.student_name,
      weekKey: r.week_key,
      reasons: r.reasons ?? [],
      attendancePct: r.attendance_pct,
      assignmentPct: r.assignment_pct,
      avgQuiz: r.avg_quiz,
      sentAt: r.sent_at,
      cohortName: r.cohort_name,
    })),
  };
}

/** Admin-only weekly report status (uses org JWT, not CRON_SECRET). */
export async function handleReminderStatus(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (req.query.slot !== 'status') return false;
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : '';
  if (!orgId) {
    res.status(400).json({ error: 'orgId required', code: 'bad_request' });
    return true;
  }

  try {
    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });
    const payload = await buildStatusPayload(serviceDb);
    res.status(200).json(payload);
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return true;
    console.error(`[${ROUTE}]`, e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
  return true;
}
