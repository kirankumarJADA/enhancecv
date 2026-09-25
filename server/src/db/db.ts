import { Pool, type PoolClient, type QueryResult } from 'pg';

let pool: Pool | null = null;

/** Minimal query interface satisfied by both Pool and a checked-out client. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

export function asQueryable(db: Pool | PoolClient): Queryable {
  return db as unknown as Queryable;
}

function shouldUseSsl(connectionString: string): boolean {
  const explicit = process.env.DATABASE_SSL;
  if (explicit === 'false' || explicit === '0') return false;
  if (explicit === 'true' || explicit === '1') return true;
  // Supabase/Render and other hosted providers require TLS; local dev does not.
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local'));
  } catch {
    return true;
  }
}

export function getDb(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function initializeDatabase(): Promise<void> {
  const db = getDb();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      target_role TEXT NOT NULL DEFAULT '',
      onboarded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('master', 'tailored')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      job_id TEXT,
      ats_score INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_resumes_user
      ON resumes(user_id);

    CREATE TABLE IF NOT EXISTS job_descriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user
      ON job_descriptions(user_id);

    CREATE TABLE IF NOT EXISTS job_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_analyses_user
      ON job_analyses(user_id);

    CREATE TABLE IF NOT EXISTS ats_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ats_analyses_resume
      ON ats_analyses(resume_id);

    CREATE TABLE IF NOT EXISTS match_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      master_resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_match_analyses_user
      ON match_analyses(user_id);

    CREATE TABLE IF NOT EXISTS tailoring_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      match_analysis_id TEXT,
      version_id TEXT NOT NULL,
      before_ats INTEGER NOT NULL,
      after_ats INTEGER NOT NULL,
      before_match INTEGER NOT NULL,
      after_match INTEGER NOT NULL,
      truth_passed BOOLEAN NOT NULL,
      change_log TEXT NOT NULL,
      truth_report TEXT NOT NULL,
      keyword_coverage_before INTEGER NOT NULL,
      keyword_coverage_after INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_runs_user
      ON tailoring_runs(user_id);

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT,
      resume_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'fallback')),
      error_code TEXT,
      iterations INTEGER,
      rejected_claims INTEGER,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_ai_runs_user
      ON ai_runs(user_id);
  `);

  // Emails are matched case-insensitively (the previous database used a
  // NOCASE collation). The functional unique index preserves that semantics.
  await db.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email))',
  );

  await migrateExtensions(db);
}

/** Additive migrations for the platform features (safe to run repeatedly). */
async function migrateExtensions(db: Pool): Promise<void> {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS template_id TEXT NOT NULL DEFAULT 'classic';
    ALTER TABLE resumes ADD COLUMN IF NOT EXISTS template_id TEXT NOT NULL DEFAULT 'classic';

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature TEXT NOT NULL,
      period TEXT NOT NULL,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user_feature ON usage_records(user_id, feature, period);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'FREE',
      status TEXT NOT NULL DEFAULT 'inactive',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      stripe_event_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      job_url TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      salary TEXT NOT NULL DEFAULT '',
      job_id TEXT REFERENCES job_descriptions(id) ON DELETE SET NULL,
      resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      cover_letter_id TEXT,
      template_id TEXT NOT NULL DEFAULT 'classic',
      applied_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'SAVED'
        CHECK (status IN ('SAVED','APPLIED','SCREENING','INTERVIEW','OFFER','REJECTED','WITHDRAWN')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);

    CREATE TABLE IF NOT EXISTS cover_letters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES job_descriptions(id) ON DELETE SET NULL,
      resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT 'Cover letter',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cover_letters_user ON cover_letters(user_id);

    CREATE TABLE IF NOT EXISTS linkedin_generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES job_descriptions(id) ON DELETE SET NULL,
      resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_linkedin_user ON linkedin_generations(user_id);

    CREATE TABLE IF NOT EXISTS error_events (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      request_id TEXT,
      user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_error_events_created ON error_events(created_at);

    CREATE TABLE IF NOT EXISTS saved_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      salary TEXT NOT NULL DEFAULT '',
      employment_type TEXT NOT NULL DEFAULT '',
      remote_type TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'import',
      posted_at TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '',
      technologies TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'SAVED' CHECK (status IN ('SAVED', 'DISMISSED')),
      match_score INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON saved_jobs(user_id, status);

    CREATE TABLE IF NOT EXISTS job_searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      preferences TEXT NOT NULL,
      results_returned INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT 'none',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_job_searches_user ON job_searches(user_id);

    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES job_descriptions(id) ON DELETE SET NULL,
      resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      application_id TEXT,
      mode TEXT NOT NULL DEFAULT 'TEXT' CHECK (mode IN ('TEXT', 'VOICE')),
      kind TEXT NOT NULL DEFAULT 'PREP' CHECK (kind IN ('PREP', 'MOCK')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED')),
      overall_feedback TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);

    CREATE TABLE IF NOT EXISTS interview_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      why_it_may_be_asked TEXT NOT NULL DEFAULT '',
      evidence_from_cv TEXT NOT NULL DEFAULT '',
      recommended_answer_structure TEXT NOT NULL DEFAULT '',
      sample_truthful_answer TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_interview_questions_session ON interview_questions(session_id);

    CREATE TABLE IF NOT EXISTS interview_answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
      answer TEXT NOT NULL,
      evaluation TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_interview_answers_session ON interview_answers(session_id);

    CREATE TABLE IF NOT EXISTS company_research (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_company_research_user ON company_research(user_id);

    CREATE TABLE IF NOT EXISTS extension_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT 'Browser extension',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_extension_tokens_user ON extension_tokens(user_id);

    CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_status TEXT NOT NULL DEFAULT '',
      to_status TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_application_events_app ON application_events(application_id);
  `);

  // Promote configured admin emails (bootstrap only — empty by default).
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const email of adminEmails) {
    await db.query("UPDATE users SET role = 'ADMIN' WHERE lower(email) = $1", [email]);
  }
}

/** Run a callback on a checked-out client inside a transaction. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // connection may already be broken — release regardless
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Render a timestamptz as the same 'YYYY-MM-DD HH:MM:SS' UTC text the API has always returned. */
export const TS_TEXT = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
