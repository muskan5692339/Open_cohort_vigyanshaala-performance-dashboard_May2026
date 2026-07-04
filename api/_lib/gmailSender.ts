import nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

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

export async function sendGmailMessage(input: SendMailInput): Promise<void> {
  const cfg = getGmailConfig();
  if (!cfg) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.user}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
