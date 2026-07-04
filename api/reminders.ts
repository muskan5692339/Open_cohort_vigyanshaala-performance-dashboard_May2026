import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runWeeklyStudentReminders } from './_lib/runStudentReminders.js';

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

  try {
    const db = createServiceClient();
    const slot = typeof req.query.slot === 'string' ? req.query.slot : undefined;
    const result = await runWeeklyStudentReminders(db, slot);
    const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
    return res.status(status).json({ ok: status === 200, ...result });
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
