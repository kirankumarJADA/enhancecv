// CORS origin allow-list.
//
// - The production frontend origin is built in (the Vercel deployment this
//   backend exists to serve), so the deployed backend never silently loses
//   CORS if FRONTEND_URL is unset or mistyped on the hosting provider.
// - FRONTEND_URL (if configured) is honoured and joins the allow-list, as do
//   the local development origins.
// - Trailing slashes and case are normalised so variants of the same origin
//   match exactly once.
// - Requests without an Origin header (curl, Stripe webhooks, server-to-server)
//   are allowed through — the browser is the only enforcer of CORS, and no
//   origin means no cross-origin read to protect.
// - Unapproved origins get NO Access-Control-Allow-Origin header, so browsers
//   block the response. We never reflect arbitrary origins, and we never use
//   '*' together with credentials.

const BUILTIN_PRODUCTION_ORIGINS = ['https://enhancecv-orpin.vercel.app'];

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
  const list = [...BUILTIN_PRODUCTION_ORIGINS, ...(configured ? [configured] : []), ...DEV_ORIGINS];
  return [...new Set(list.map(normalise))];
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
