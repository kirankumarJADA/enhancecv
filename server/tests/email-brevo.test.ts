// Brevo transactional-email provider tests.
//
// All external HTTP is stubbed via vi.spyOn(globalThis, 'fetch') — no real
// email is ever sent and no real API key is ever used here. The key values
// used below are obviously fake dummies; assertions never print header
// values, only check presence.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

type FetchSpy = { mockRestore: () => void };

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const DUMMY_KEY = 'brevo-dummy-key-not-a-real-secret-x83';

// Captured state of the outbound HTTP call.
interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

let sendEmail: typeof import('../src/lib/email').sendEmail;
let isEmailConfigured: typeof import('../src/lib/email').isEmailConfigured;

type ConsoleSpy = ReturnType<typeof vi.spyOn>;

function mockConsoleError(): ConsoleSpy {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}
function capturedLog(spy: ConsoleSpy): string {
  return (spy.mock.calls as unknown[][])
    .map((call) => call.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' '))
    .join('\n');
}

/** Stub the outbound HTTPS call, recording url/method/headers/body. */
function stubFetch(status: number, responseBody: string, record: CapturedCall[], fail?: () => never): FetchSpy {
  const impl = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (fail) fail();
    record.push({
      url: String(url),
      method: String(init?.method || 'GET'),
      headers: (init?.headers as Record<string, string>) || {},
      body: JSON.parse(String(init?.body || '{}')),
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => responseBody,
      json: async () => JSON.parse(responseBody || '{}'),
    } as unknown as Awaited<ReturnType<typeof fetch>>;
  }) as unknown as typeof fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl) as unknown as FetchSpy;
}

beforeAll(async () => {
  // NODE_ENV must be set BEFORE ../src/lib/email (and its config import) is
  // evaluated: config.isProd is captured at module-evaluation time and the
  // production fail-closed behavior is exactly what these tests assert.
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5433/unused';
  const mod = await import('../src/lib/email');
  sendEmail = mod.sendEmail;
  isEmailConfigured = mod.isEmailConfigured;
});

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_FROM;
});

beforeEach(() => {
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.EMAIL_API_KEY = DUMMY_KEY;
  process.env.EMAIL_FROM = 'noreply@curevo.dpdns.org';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKENISH = 'a'.repeat(48);

describe('brevo provider — successful send', () => {
  it('posts the correct payload to the Brevo API and reports delivery', async () => {
    const calls: CapturedCall[] = [];
    const spy = stubFetch(200, JSON.stringify({ messageId: 'm1' }), calls);

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Verify your Curevo AI email address',
      text: `Welcome!\n\nhttps://app.example.com/verify-email?token=${TOKENISH}`,
    });
    spy.mockRestore();

    expect(result).toMatchObject({ delivered: true, provider: 'brevo' });
    expect(calls.length).toBe(1);
    const call = calls[0];
    expect(call.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(call.method).toBe('POST');
    // credential is transported, never logged — assert presence only
    expect(typeof call.headers['api-key']).toBe('string');
    expect(call.headers['api-key'].length).toBeGreaterThan(0);
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body).toEqual({
      sender: { name: 'Curevo AI', email: 'noreply@curevo.dpdns.org' },
      to: [{ email: 'user@example.com' }],
      subject: 'Verify your Curevo AI email address',
      textContent: `Welcome!\n\nhttps://app.example.com/verify-email?token=${TOKENISH}`,
    });
  });

  it('accepts EMAIL_FROM in "Name <addr>" form and sends the bare address', async () => {
    process.env.EMAIL_FROM = 'Curevo AI <noreply@curevo.dpdns.org>';
    const calls: CapturedCall[] = [];
    const spy = stubFetch(200, '{}', calls);
    await sendEmail({ to: 'user@example.com', subject: 's', text: 'b' });
    spy.mockRestore();
    expect(calls[0].body.sender).toEqual({ name: 'Curevo AI', email: 'noreply@curevo.dpdns.org' });
  });

  it('isEmailConfigured reflects provider + credential', async () => {
    expect(isEmailConfigured()).toBe(true);
    delete process.env.EMAIL_API_KEY;
    expect(isEmailConfigured()).toBe(false);
    process.env.EMAIL_PROVIDER = 'console';
    expect(isEmailConfigured()).toBe(false);
  });
});

describe('brevo provider — failure paths (fail-closed, no leaks)', () => {
  it('missing API key: production withholds the token-bearing body entirely', async () => {
    delete process.env.EMAIL_API_KEY;
    const spy = mockConsoleError();

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Reset your Curevo AI password',
      text: `Open this link to choose a new password (valid for 1 hour):\nhttps://app.example.com/reset-password?token=${TOKENISH}`,
    });
    const log = capturedLog(spy);
    spy.mockRestore();

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('console');
    expect(result.actionUrl).toBeUndefined();
    // fail-closed: no token-bearing URL in logs, no action URL in the result
    expect(log).not.toMatch(/reset-password\?token=/i);
    expect(log).not.toMatch(TOKENISH);
    expect(JSON.stringify(result)).not.toMatch(/token/i);
  });

  it('provider rejection: returns delivered:false and logs only the status code', async () => {
    const calls: CapturedCall[] = [];
    // Response body deliberately contains the credential and the message body —
    // the provider error path must never surface either of them.
    const leakedBody = JSON.stringify({ message: 'bad key ' + DUMMY_KEY, echo: TOKENISH });
    const spy = stubFetch(401, leakedBody, calls);
    const logSpy = mockConsoleError();

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Verify your Curevo AI email address',
      text: `body-with ${TOKENISH}`,
    });
    const log = capturedLog(logSpy);
    logSpy.mockRestore();
    spy.mockRestore();

    expect(result).toEqual({ delivered: false, provider: 'brevo' });
    expect(calls.length).toBe(1);
    // the sanitized error line may only carry the status code
    expect(log).toContain('brevo status=401');
    expect(log).not.toContain(DUMMY_KEY);
    expect(log).not.toContain(TOKENISH);
    expect(log).not.toContain('bad key');
    expect(JSON.stringify(result)).not.toContain(DUMMY_KEY);
    expect(JSON.stringify(result)).not.toContain(TOKENISH);
  });

  it('network failure: never throws into the caller, reports undelivered', async () => {
    const spy = stubFetch(0, '', [], () => {
      throw new Error('ECONNREFUSED');
    });
    const logSpy = mockConsoleError();

    const result = await sendEmail({ to: 'user@example.com', subject: 's', text: 'b' });
    logSpy.mockRestore();
    spy.mockRestore();

    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('brevo');
  });

  it('server-side rejection (500) is handled identically without leaking the response', async () => {
    const calls: CapturedCall[] = [];
    const spy = stubFetch(500, 'internal: ' + DUMMY_KEY, calls);
    const logSpy = mockConsoleError();
    const result = await sendEmail({ to: 'user@example.com', subject: 's', text: 'b' });
    const log = capturedLog(logSpy);
    logSpy.mockRestore();
    spy.mockRestore();
    expect(result.delivered).toBe(false);
    expect(log).toContain('brevo status=500');
    expect(log).not.toContain(DUMMY_KEY);
  });
});
