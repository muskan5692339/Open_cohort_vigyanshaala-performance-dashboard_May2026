import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runWeeklyStudentReminders } from './_lib/runStudentReminders.js';
import { handleReminderStatus } from './_lib/reminderStatusHandler.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin status UI — org JWT auth (not CRON_SECRET). Kept on this route to stay within Hobby's 12-function limit.
  if (await handleReminderStatus(req, res)) return;

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.query.slot === 'ping') {
    return res.status(200).json({
      ok: true,
      ping: true,
      dryRun: true,
      disabled: true,
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
        note: 'Preview only — weekly emails are disabled; no emails are sent.',
      });
    } catch (e) {
      const message = (e as Error).message;
      console.error('[api/reminders count]', e);
      return res.status(500).json({ ok: false, error: message });
    }
  }

  // Weekly student emails are turned off. Restore vercel.json reminder crons + remove this return to re-enable.
  return res.status(200).json({
    ok: true,
    skipped: true,
    disabled: true,
    note: 'Weekly student email reports are disabled. Sunday/Wednesday crons were removed from vercel.json.',
  });
}

export const config = { maxDuration: 120 };
