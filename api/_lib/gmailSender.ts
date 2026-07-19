import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let cachedTransporter: Transporter | null = null;

export function getGmailConfig(): { user: string; pass: string; fromName: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !pass) return null;
  return {
    user,
    pass,
    fromName: process.env.REMINDER_FROM_NAME?.trim() || 'VigyanShaala She for STEM',
  };
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  const cfg = getGmailConfig();
  if (!cfg) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 1,
  });
  return cachedTransporter;
}

export async function sendGmailMessage(input: SendMailInput): Promise<void> {
  const cfg = getGmailConfig();
  if (!cfg) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');

  await getTransporter().sendMail({
    from: `"${cfg.fromName}" <${cfg.user}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
