import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runWeeklyStudentReminders, runTestStudentReminder, runPilotStudentReminders } from './_lib/runStudentReminders.js';

function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url?.startsWith('http') || !serviceKey) {
    throw new Error('Missing Supabase service configuration');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

function parseNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
  const n = parseNonNegativeInt(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('454') || m.includes('too many login') || m.includes('rate limit');
}

function productionBaseUrl(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, '')}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'https://open-cohort-vigyanshaala-performanc.vercel.app';
}

function queueNextReminderBatch(slot: string, limit?: number, weekKeySuffix?: string): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return;
  const params = new URLSearchParams({
    slot: slot === 'auto' ? 'morning' : slot,
    live: 'true',
    auto: '1',
    limit: String(limit ?? Number(process.env.REMINDER_BATCH_SIZE ?? 25)),
  });
  if (weekKeySuffix) params.set('week', weekKeySuffix);
  const url = `${productionBaseUrl()}/api/reminders?${params.toString()}`;
  void fetch(url, { headers: { Authorization: `Bearer ${secret}` } }).catch(err => {
    console.error('[api/reminders auto-chain]', err);
  });
}

function shouldQueueNextBatch(
  result: Awaited<ReturnType<typeof runWeeklyStudentReminders>>,
  auto: boolean,
): boolean {
  if (!auto || result.dryRun || result.remaining <= 0) return false;
  if (result.sent === 0 && result.errors.some(e => isRateLimitError(e.message))) return false;
  return true;
}

function istWeekdayShort(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date());
}

function resolveScheduledSend():
  | { run: true; weekKeySuffix?: string; label: string }
  | { run: false; label: string } {
  const day = istWeekdayShort();
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (day === 'Sun' && hour === 9) return { run: true, label: 'Sunday weekly report (9:30 AM IST)' };
  if (day === 'Wed' && hour === 15) {
    return { run: true, weekKeySuffix: 'midweek', label: 'Wednesday mid-week report (3:30 PM IST)' };
  }
  return { run: false, label: `${day} ${hour}:00 IST` };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.query.slot === 'ping') {
    return res.status(200).json({
      ok: true,
      ping: true,
      dryRun: process.env.REMINDER_DRY_RUN === 'true',
    });
  }

  if (req.query.slot === 'count') {
    try {
      const db = createServiceClient();
      const slot = req.query.reminderSlot === 'evening' ? 'evening' : 'morning';
      const weekKeySuffix = typeof req.query.week === 'string' ? req.query.week.trim() : undefined;
      const result = await runWeeklyStudentReminders(db, slot, { preview: true, weekKeySuffix });
      return res.status(200).json({
        ok: true,
        count: true,
        activeCandidates: result.candidates,
        wouldEmail: result.sent,
        weekKey: result.weekKey,
        cohortName: result.cohortName,
        note: 'Preview only — no emails sent. Active students with pending attendance, assignments, or quizzes.',
      });
    } catch (e) {
      const message = (e as Error).message;
      console.error('[api/reminders count]', e);
      return res.status(500).json({ ok: false, error: message });
    }
  }

  if (req.query.slot === 'test') {
    const to =
      (typeof req.query.to === 'string' ? req.query.to : process.env.REMINDER_TEST_EMAIL)?.trim();
    if (!to) {
      return res.status(400).json({
        ok: false,
        error: 'Provide ?to=your@email.com or set REMINDER_TEST_EMAIL in Vercel',
      });
    }
    const studentEmail = typeof req.query.student === 'string' ? req.query.student : undefined;
    try {
      const db = createServiceClient();
      const result = await runTestStudentReminder(db, { to, studentEmail });
      return res.status(200).json(result);
    } catch (e) {
      const message = (e as Error).message;
      console.error('[api/reminders test]', e);
      return res.status(500).json({ ok: false, error: message });
    }
  }

  if (req.query.slot === 'pilot') {
    const limit = parsePositiveInt(req.query.limit)
      ?? parsePositiveInt(process.env.REMINDER_PILOT_LIMIT)
      ?? 10;
    try {
      const db = createServiceClient();
      const result = await runPilotStudentReminders(db, limit);
      const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
      return res.status(status).json({ ok: status === 200, pilot: true, ...result });
    } catch (e) {
      const message = (e as Error).message;
      console.error('[api/reminders pilot]', e);
      return res.status(500).json({ ok: false, error: message });
    }
  }

  if (req.query.slot === 'auto') {
    const scheduleKey = typeof req.query.schedule === 'string' ? req.query.schedule : undefined;
    let weekKeySuffix: string | undefined;
    let sendLabel: string;

    if (scheduleKey === 'wednesday') {
      weekKeySuffix = 'midweek';
      sendLabel = 'Wednesday mid-week report (3:30 PM IST)';
    } else if (scheduleKey === 'sunday') {
      sendLabel = 'Sunday weekly report (9:30 AM IST)';
    } else {
      const schedule = resolveScheduledSend();
      if (!schedule.run) {
        return res.status(200).json({
          ok: true,
          scheduled: false,
          skipped: true,
          istDay: schedule.label,
          note: 'Reminders run automatically on Wednesday (3:30 PM IST) and Sunday (9:30 AM IST).',
        });
      }
      weekKeySuffix = schedule.weekKeySuffix;
      sendLabel = schedule.label;
    }

    try {
      const db = createServiceClient();
      const result = await runWeeklyStudentReminders(db, 'morning', {
        forceLive: true,
        auto: true,
        weekKeySuffix,
      });
      const chainQueued = shouldQueueNextBatch(result, true);
      if (chainQueued) {
        queueNextReminderBatch('morning', result.batchLimit ?? undefined, weekKeySuffix);
      }
      const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
      return res.status(status).json({
        ok: status === 200,
        scheduled: true,
        sendLabel,
        ...result,
        chainQueued,
        note: chainQueued
          ? 'Next batch queued automatically.'
          : result.remaining > 0
            ? 'Paused (Gmail rate limit). Remaining students will be picked up on the next chain cycle.'
            : undefined,
      });
    } catch (e) {
      const message = (e as Error).message;
      console.error('[api/reminders auto]', e);
      return res.status(500).json({ ok: false, error: message });
    }
  }

  try {
    const db = createServiceClient();
    const slotRaw = typeof req.query.slot === 'string' ? req.query.slot : undefined;
    // Legacy cron used ?slot=morning without live/auto — treat Vercel cron hits as live batch sends.
    const fromVercelCron = Boolean(req.headers['x-vercel-cron']);
    const slot = slotRaw === 'sendall' ? 'morning' : slotRaw;
    const limit = parsePositiveInt(req.query.limit);
    const offset = parseNonNegativeInt(req.query.offset) ?? 0;
    const forceLive =
      req.query.live === 'true'
      || slotRaw === 'sendall'
      || fromVercelCron;
    const auto =
      req.query.auto === '1'
      || req.query.auto === 'true'
      || slotRaw === 'sendall'
      || fromVercelCron;
    const weekKeySuffix = typeof req.query.week === 'string' ? req.query.week.trim() : undefined;
    const result = await runWeeklyStudentReminders(db, slot, { limit, offset, forceLive, auto, weekKeySuffix });
    const chainQueued = shouldQueueNextBatch(result, auto);
    if (chainQueued) queueNextReminderBatch(slot ?? 'morning', result.batchLimit ?? limit, weekKeySuffix);
    const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
    return res.status(status).json({
      ok: status === 200,
      ...result,
      chainQueued,
      note: chainQueued
        ? 'Next batch queued automatically — no manual steps needed.'
        : result.remaining > 0 && auto
          ? 'Paused (Gmail rate limit or timeout). Call ?slot=sendall again in ~1 hour to continue.'
          : undefined,
    });
  } catch (e) {
    const message = (e as Error).message;
    console.error('[api/reminders]', e);
    if (message.includes('Missing Supabase')) {
      return res.status(503).json({ ok: false, error: message, code: 'misconfigured' });
    }
    return res.status(500).json({ ok: false, error: message });
  }
}

export const config = { maxDuration: 120 };
