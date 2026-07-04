import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from './_lib/serviceClient.js';
import { runWeeklyStudentReminders } from './_lib/runStudentReminders.js';

function isAuthorizedCron(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.authorization;
  return auth === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = createServiceClient();
    const result = await runWeeklyStudentReminders(db);
    const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
    return res.status(status).json({ ok: status === 200, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: message });
  }
}
