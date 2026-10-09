// PostgreSQL connection-pool resilience regression suite.
//
// THE BUG: `pg.Pool` had no 'error' listener in db.ts. `pg` re-emits the error
// of an IDLE pooled client on the pool itself (pg-pool: `pool.emit('error',
// err, client)`), which is what happens when a database connection is lost to a
// restart, a network blip, or a server-side idle timeout. An EventEmitter
// 'error' event with NO listener is fatal in Node, so losing the connection
// terminated the entire API process: the service went down for every user until
// it was restarted, instead of a single request failing.
//
// Query-rejection tests could not detect this — a rejecting query is an
// ordinary handled error. These tests exercise the pool's own error event,
// including killing a REAL idle server-side connection with pg_terminate_backend
// from a separate connection. That is exactly the event that used to crash the
// process, and it needs no container or service restarts: the database stays up
// and only this suite's own pooled connection is destroyed.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import type { Express } from 'express';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

let app: Express;
let getDb: typeof import('../src/db/db').getDb;

beforeAll(async () => {
  delete process.env.NODE_ENV;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';

  const [appModule, dbModule] = await Promise.all([import('../src/app'), import('../src/db/db')]);
  getDb = dbModule.getDb;
  app = await appModule.buildApp();

  await getDb().query('TRUNCATE user_sessions, users CASCADE');
});

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

beforeEach(() => {
  __resetRateLimitsForTests();
});

// --- helpers ---------------------------------------------------------------

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const found = list.find((c) => c.startsWith('ecv_session='));
  if (!found) return '';
  const value = found.split(';')[0];
  return value === 'ecv_session=' ? '' : value;
}

async function signup(tag: string, password = 'pool-test-password-1') {
  const email = `db-pool-${tag}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}@test.dev`;
  const res = await request(app).post('/api/auth/signup').send({ name: 'Pool Test', email, password });
  expect(res.status).toBe(201);
  return { email, password, cookie: cookieFrom(res) };
}

function me(cookie: string) {
  return request(app).get('/api/auth/me').set('Cookie', cookie);
}

/** Loopback check mirroring db.ts's SSL heuristic, for the throwaway client. */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * Kill one IDLE pooled connection on the server side.
 *
 * The client is released back to the pool first so it is in the idle state in
 * which `pg` re-emits its error on the pool — the state the crash occurred in.
 * The kill is issued from a separate connection so it cannot take out the
 * connection issuing it.
 */
async function killIdlePoolConnection(): Promise<number> {
  const pool = getDb();
  const client = await pool.connect();
  let pid: number;
  try {
    pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  } finally {
    client.release();
  }

  const killer = new Client({
    connectionString: TEST_DATABASE_URL,
    ssl: isLoopback(TEST_DATABASE_URL) ? false : { rejectUnauthorized: false },
  });
  try {
    await killer.connect();
    await killer.query('SELECT pg_terminate_backend($1)', [pid]);
  } finally {
    await killer.end();
  }
  return pid;
}

/** Collect console.error output for the duration of `fn`. */
async function captureConsoleError(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a)).join(' '));
  };
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return captured;
}

// --- tests -----------------------------------------------------------------

describe('the pool always has an error listener', () => {
  it('registers a listener, so a pool error can never be fatal', () => {
    // Without a listener, emitting 'error' on an EventEmitter throws and, for
    // an unhandled pool event, terminates the Node process.
    expect(getDb().listenerCount('error')).toBeGreaterThan(0);
  });

  it('does not throw when the pool emits an error', () => {
    expect(() => getDb().emit('error', new Error('simulated idle client failure'))).not.toThrow();
  });

  it('logs the pool error sanitised, without credentials', async () => {
    const captured = await captureConsoleError(async () => {
      getDb().emit('error', new Error('simulated idle client failure'));
      // captureError is reached through a lazy import, so give it a tick.
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    const log = captured.join('\n');
    expect(log).toContain('DB_POOL_IDLE_CLIENT_ERROR');
    // Never a connection string, credential, or query text.
    expect(log).not.toMatch(/postgres:\/\//i);
    expect(log).not.toMatch(/ecvlocal/i);
    expect(log).not.toMatch(/password|user_name|\bselect\b/i);
  });
});

describe('losing a real idle connection', () => {
  it('does not terminate the process', async () => {
    const captured = await captureConsoleError(async () => {
      const pid = await killIdlePoolConnection();
      expect(pid).toBeGreaterThan(0);
      // Time for the pool to observe the dead socket and handle the event.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    // Reaching this line at all is the regression assertion: before the fix the
    // unhandled pool 'error' event terminated the whole process.
    expect(captured.join('\n')).toContain('DB_POOL_IDLE_CLIENT_ERROR');
    expect(captured.join('\n')).not.toMatch(/ecvlocal/i);
  });

  it('recovers without a restart — database-backed requests keep working', async () => {
    const user = await signup('recovery');
    expect((await me(user.cookie)).status).toBe(200);

    await killIdlePoolConnection();

    // The pool opens a fresh connection, so this must still authenticate.
    expect((await me(user.cookie)).status).toBe(200);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('keeps session revocation working after the connection was lost', async () => {
    const user = await signup('recovery-logout');
    expect((await me(user.cookie)).status).toBe(200);

    await killIdlePoolConnection();

    expect((await request(app).post('/api/auth/logout').set('Cookie', user.cookie)).status).toBe(200);
    expect((await me(user.cookie)).status).toBe(401);
  });
});

describe('the database being unavailable', () => {
  it('fails closed rather than reporting success, and survives', async () => {
    const user = await signup('fail-closed');
    expect((await me(user.cookie)).status).toBe(200);

    const pool = getDb() as unknown as { query: (...args: unknown[]) => unknown };
    const spy = vi.spyOn(pool, 'query').mockImplementation(() => Promise.reject(new Error('simulated outage')));

    try {
      const res = await me(user.cookie);
      // A check that could not run must never be treated as "session valid".
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }

    // Still alive, and correct again once storage recovers.
    expect((await me(user.cookie)).status).toBe(200);
  });
});
