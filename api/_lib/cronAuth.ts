import type { VercelRequest } from '@vercel/node';

export function isAuthorizedCron(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.authorization === `Bearer ${secret}`;
}
