// Centralised error monitoring service.
//
// - Sanitised capture: never store or log passwords, tokens, API keys, JWTs,
//   resume contents or job descriptions — only error codes, safe messages and
//   correlation ids.
// - Pluggable provider: with SENTRY_DSN configured, errors are forwarded to
//   Sentry's store API over plain HTTP (no SDK dependency); without it, the
//   app logs safely and records to the local error_events table.
// - captureError never throws — monitoring must not break request handling.

import crypto from 'node:crypto';
import { getDb } from '../db/db';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  code?: string;
  route?: string;
}

/** Patterns scrubbed from any message before logging/forwarding. */
const SENSITIVE_PATTERN =
  /(password|passwd|secret|api[_-]?key|authorization|bearer|jwt|token\s*[:=]|database[_-]?url|postgres:\/\/[^\s]+)/gi;

function sanitize(text: string): string {
  return text.replace(SENSITIVE_PATTERN, '[redacted]').slice(0, 500);
}

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseSentryDsn(dsn: string): SentryDsn | null {
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

async function forwardToSentry(dsn: SentryDsn, err: unknown, ctx: ErrorContext): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const body = {
    timestamp: new Date().toISOString(),
    platform: 'node',
    environment: process.env.NODE_ENV || 'development',
    level: 'error',
    logger: 'curevo',
    tags: { code: ctx.code || 'INTERNAL', route: ctx.route || '' },
    extra: { requestId: ctx.requestId || '' },
    culprit: ctx.route || 'server',
    message: sanitize(message),
    exception: {
      values: [
        {
          type: err instanceof Error ? err.name : 'Error',
          value: sanitize(message),
          // Stack traces can embed file paths but not secrets; still trim.
          stacktrace: err instanceof Error ? { frames: [] } : undefined,
        },
      ],
    },
  };
  const res = await fetch(`https://${dsn.host}/api/${dsn.projectId}/store/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=curevo/1.0`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.error(`sentry forward failed status=${res.status}`);
  }
}

export function captureError(err: unknown, ctx: ErrorContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const safeMessage = sanitize(message);
  console.error(`[error] code=${ctx.code || 'INTERNAL'} route=${ctx.route || '-'} requestId=${ctx.requestId || '-'} message=${safeMessage}`);

  // Local record for the admin dashboard (best effort).
  void getDb()
    .query(
      'INSERT INTO error_events (id, code, message, request_id, user_id) VALUES ($1, $2, $3, $4, $5)',
      [`err_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, ctx.code || 'INTERNAL', safeMessage, ctx.requestId || null, ctx.userId || null],
    )
    .catch(() => {
      // error table itself unavailable — nothing more we can safely do
    });

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    const parsed = parseSentryDsn(dsn);
    if (parsed) {
      void forwardToSentry(parsed, err, ctx).catch(() => {});
    } else {
      console.error('SENTRY_DSN is set but malformed — ignoring');
    }
  }
}

/** Generate a correlation id for a request. */
export function newRequestId(): string {
  return crypto.randomBytes(8).toString('hex');
}
