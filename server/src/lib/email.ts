// Email provider abstraction.
//
// Providers:
//   console (default) — dev mode: prints the email intent and link to the
//     server log. This is clearly NOT email delivery; the UI tells the user
//     to check logs or use the link directly.
//   resend — HTTPS API (EMAIL_API_KEY).
//   sendgrid — HTTPS API (EMAIL_API_KEY).
//
// sendEmail never throws into request handling: failures are logged via the
// monitoring service and surfaced to callers through the returned result.

import { captureError } from './monitoring';

export type EmailProviderId = 'console' | 'resend' | 'sendgrid';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  delivered: boolean;
  provider: EmailProviderId;
  /** Dev-mode only: the action URL so the flow is testable without a provider. */
  actionUrl?: string;
}

function activeProvider(): EmailProviderId {
  const p = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  return p === 'resend' || p === 'sendgrid' ? (p as EmailProviderId) : 'console';
}

export function isEmailConfigured(): boolean {
  if (activeProvider() === 'console') return false;
  return !!process.env.EMAIL_API_KEY;
}

async function sendViaResend(msg: EmailMessage): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Curevo AI <onboarding@resend.dev>',
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`resend status=${res.status}`);
  }
  return true;
}

async function sendViaSendgrid(msg: EmailMessage): Promise<boolean> {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }] }],
      from: { email: process.env.EMAIL_FROM || 'noreply@example.com', name: 'Curevo AI' },
      subject: msg.subject,
      content: [{ type: 'text/plain', value: msg.text }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`sendgrid status=${res.status}`);
  }
  return true;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailSendResult> {
  const provider = activeProvider();
  if (provider === 'console' || !process.env.EMAIL_API_KEY) {
    // Dev mode: log the full message so flows remain testable without a
    // provider. Explicitly marked as NOT delivered.
    console.error(`[email:console] NOT DELIVERED — to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    const link = msg.text.match(/https?:\/\/\S+/)?.[0];
    return { delivered: false, provider: 'console', actionUrl: link };
  }
  try {
    if (provider === 'resend') {
      await sendViaResend(msg);
    } else {
      await sendViaSendgrid(msg);
    }
    return { delivered: true, provider };
  } catch (err) {
    captureError(err, { code: 'EMAIL_SEND_FAILED' });
    return { delivered: false, provider };
  }
}
