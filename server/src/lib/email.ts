// Email provider abstraction.
//
// Providers:
//   console (default) — dev mode: prints the email intent and link to the
//     server log. This is clearly NOT email delivery; the UI tells the user
//     to check logs or use the link directly.
//   resend — HTTPS API (EMAIL_API_KEY).
//   sendgrid — HTTPS API (EMAIL_API_KEY).
//   brevo — HTTPS API (EMAIL_API_KEY), sender name "Curevo AI".
//
// sendEmail never throws into request handling: failures are logged via the
// monitoring service and surfaced to callers through the returned result.
// Provider failures surface only as `"<provider> status=<code>"` — response
// bodies, credentials and message contents are never logged or returned.

import { config } from '../config';
import { captureError } from './monitoring';

export type EmailProviderId = 'console' | 'resend' | 'sendgrid' | 'brevo';

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
  return p === 'resend' || p === 'sendgrid' || p === 'brevo' ? (p as EmailProviderId) : 'console';
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

/** EMAIL_FROM accepts both "addr" and "Name <addr>"; Brevo needs the bare address. */
function brevoSenderEmail(): string {
  const raw = (process.env.EMAIL_FROM || 'noreply@example.com').trim();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

async function sendViaBrevo(msg: EmailMessage): Promise<boolean> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.EMAIL_API_KEY ?? '',
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Curevo AI', email: brevoSenderEmail() },
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`brevo status=${res.status}`);
  }
  return true;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailSendResult> {
  const provider = activeProvider();
  if (provider === 'console' || !process.env.EMAIL_API_KEY) {
    // No deliverable transport. Verification and password-reset messages carry
    // single-use tokens, so in PRODUCTION nothing token-bearing is logged and
    // no action URL is produced — the token stays discoverable only through a
    // real email. This gate is hard-wired to NODE_ENV on purpose: it must not
    // depend on whether a provider happens to be configured, otherwise a
    // misconfigured deployment would hand out usable reset tokens again.
    if (config.isProd) {
      console.error(
        `[email:console] NOT DELIVERED — to=${msg.to} subject="${msg.subject}" (message body withheld: token-bearing content is not logged in production)`,
      );
    } else {
      // Development: log the full message so flows remain testable without a
      // provider. Explicitly marked as NOT delivered.
      console.error(`[email:console] NOT DELIVERED — to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    }
    const link = config.isProd ? undefined : msg.text.match(/https?:\/\/\S+/)?.[0];
    return { delivered: false, provider: 'console', actionUrl: link };
  }
  try {
    if (provider === 'resend') {
      await sendViaResend(msg);
    } else if (provider === 'brevo') {
      await sendViaBrevo(msg);
    } else {
      await sendViaSendgrid(msg);
    }
    return { delivered: true, provider };
  } catch (err) {
    captureError(err, { code: 'EMAIL_SEND_FAILED' });
    return { delivered: false, provider };
  }
}
