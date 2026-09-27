// CORS origin allow-list.
//
// - FRONTEND_URL (production frontend origin, e.g. the Vercel domain) is
//   appended to the local development origins.
// - Trailing slashes are normalised so `https://app.vercel.app/` matches
//   `https://app.vercel.app`.
// - Requests without an Origin header (curl, Stripe webhooks, same-origin
//   server calls) are allowed through — the browser is the only enforcer of
//   CORS, and no origin means no cross-origin read to protect.
// - Unapproved origins get NO Access-Control-Allow-Origin header, so browsers
//   block the response. We never reflect arbitrary origins, and we never use
//   '*' together with credentials.

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function normalise(origin: string): string {
  return origin.replace(/\/+$/, '').toLowerCase();
}

export function allowedOrigins(): string[] {
  const configured = (process.env.FRONTEND_URL || '').trim();
  const list = configured ? [configured, ...DEV_ORIGINS] : [...DEV_ORIGINS];
  return list.map(normalise);
}

/** cors origin callback: allow-list only; no wildcard with credentials. */
export function corsOriginCheck(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void {
  if (!origin) {
    cb(null, true);
    return;
  }
  if (allowedOrigins().includes(normalise(origin))) {
    cb(null, true);
    return;
  }
  // No ACAO header is emitted → the browser blocks the response.
  cb(null, false);
}
