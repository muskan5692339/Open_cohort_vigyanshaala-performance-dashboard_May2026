import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    const { createServiceClient } = await import('./_lib/serviceClient');
    const { runWeeklyStudentReminders } = await import('./_lib/runStudentReminders');
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
