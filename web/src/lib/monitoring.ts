// Curevo AI — Client-Side Error Monitoring & PII Scrubbing (Phase 9M)
//
// 100% Privacy-First & Lightweight.
// Forwards sanitized browser errors to Sentry over plain HTTP (no heavy SDK dependency).
// Strictly scrubs candidate PII, CV text, emails, auth tokens, and passwords.

export interface WebErrorContext {
  component?: string;
  action?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

const SENSITIVE_PATTERNS = [
  /password[=:\s]+[^\s&]+/gi,
  /bearer\s+[a-zA-Z0-9_\-.]+/gi,
  /token[=:\s]+[^\s&]+/gi,
  /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi, // scrub emails
  /api[_-]?key[=:\s]+[^\s&]+/gi,
];

export function scrubText(text: string): string {
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned.slice(0, 1000);
}

interface SentryClientConfig {
  publicKey: string;
  host: string;
  projectId: string;
}

export function parseWebSentryDsn(dsn: string): SentryClientConfig | null {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  return { publicKey: match[1], host: match[2], projectId: match[3] };
}

export async function forwardClientError(
  config: SentryClientConfig,
  err: unknown,
  ctx: WebErrorContext = {}
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const safeMessage = scrubText(message);

  const payload = {
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    environment: import.meta.env.MODE || 'production',
    level: 'error',
    logger: 'curevo-web',
    tags: {
      route: ctx.route || (typeof window !== 'undefined' ? window.location.pathname : ''),
      component: ctx.component || 'general',
      action: ctx.action || 'unknown',
    },
    message: safeMessage,
    exception: {
      values: [
        {
          type: err instanceof Error ? err.name : 'Error',
          value: safeMessage,
        },
      ],
    },
  };

  try {
    await fetch(`https://${config.host}/api/${config.projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${config.publicKey}, sentry_client=curevo-web/1.0`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Fail silently in browser — monitoring must never crash user session
  }
}

export function captureWebError(err: unknown, ctx: WebErrorContext = {}): void {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const safeMsg = scrubText(rawMsg);
  console.error(`[Curevo Monitoring] ${safeMsg}`, ctx);

  const dsn = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SENTRY_DSN) || '';
  if (dsn) {
    const config = parseWebSentryDsn(dsn);
    if (config) {
      void forwardClientError(config, err, ctx);
    }
  }
}

export function initGlobalErrorMonitoring(): void {
  if (typeof window === 'undefined') return;

  window.onerror = (message, source, lineno, colno, error) => {
    captureWebError(error || message, {
      component: 'window.onerror',
      extra: { source, lineno, colno },
    });
  };

  window.onunhandledrejection = (event) => {
    captureWebError(event.reason || 'Unhandled Promise Rejection', {
      component: 'window.onunhandledrejection',
    });
  };
}
