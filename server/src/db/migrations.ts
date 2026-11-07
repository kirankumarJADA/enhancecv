// Curevo AI — PostgreSQL Database Migrations Runner
//
// Manages tracked, idempotent, reversible schema migrations for Curevo AI.
// Tracks applied migrations in the schema_migrations table.

import { type Pool, type PoolClient } from 'pg';
import { getDb, asQueryable, withTransaction } from './db';

export interface Migration {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

export interface MigrationLog {
  id: string;
  name: string;
  appliedAt: Date;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_baseline_identity_schema',
    name: 'Create users, sessions, tokens, and core schema tables',
    up: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          target_role TEXT NOT NULL DEFAULT '',
          onboarded BOOLEAN NOT NULL DEFAULT FALSE,
          email_verified BOOLEAN NOT NULL DEFAULT FALSE,
          role TEXT NOT NULL DEFAULT 'USER',
          template_id TEXT NOT NULL DEFAULT 'classic',
          session_version INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

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
      `);
    },
    down: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        DROP TABLE IF EXISTS password_reset_tokens CASCADE;
        DROP TABLE IF EXISTS email_verification_tokens CASCADE;
        DROP TABLE IF EXISTS user_sessions CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);
    },
  },
  {
    id: '002_row_level_security_policies',
    name: 'Enable Row Level Security and add tenant isolation policies',
    up: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_tenant_isolation'
          ) THEN
            CREATE POLICY users_tenant_isolation ON users
              FOR ALL
              USING (
                id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
                OR current_setting('app.bypass_rls', true) = 'on'
              );
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'user_sessions' AND policyname = 'user_sessions_tenant_isolation'
          ) THEN
            CREATE POLICY user_sessions_tenant_isolation ON user_sessions
              FOR ALL
              USING (
                user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
                OR current_setting('app.bypass_rls', true) = 'on'
              );
          END IF;
        END $$;
      `);
    },
    down: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        DROP POLICY IF EXISTS users_tenant_isolation ON users;
        DROP POLICY IF EXISTS user_sessions_tenant_isolation ON user_sessions;
        ALTER TABLE users DISABLE ROW LEVEL SECURITY;
        ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;
      `);
    },
  },
  {
    id: '003_hardened_tenant_isolation_rls',
    name: 'Enforce FORCE ROW LEVEL SECURITY and explicit CRUD tenant isolation policies',
    up: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        -- Force RLS so table owner cannot bypass
        ALTER TABLE users FORCE ROW LEVEL SECURITY;
        ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

        -- Drop legacy policies
        DROP POLICY IF EXISTS users_tenant_isolation ON users;
        DROP POLICY IF EXISTS user_sessions_tenant_isolation ON user_sessions;
        DROP POLICY IF EXISTS users_select_policy ON users;
        DROP POLICY IF EXISTS users_insert_policy ON users;
        DROP POLICY IF EXISTS users_update_policy ON users;
        DROP POLICY IF EXISTS users_delete_policy ON users;
        DROP POLICY IF EXISTS sessions_select_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_insert_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_update_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_delete_policy ON user_sessions;

        -- Explicit per-operation policies for users
        CREATE POLICY users_select_policy ON users
          FOR SELECT
          USING (
            id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY users_insert_policy ON users
          FOR INSERT
          WITH CHECK (
            id IS NOT NULL AND (
              id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''), id)
              OR current_setting('app.bypass_rls', true) = 'on'
            )
          );

        CREATE POLICY users_update_policy ON users
          FOR UPDATE
          USING (
            id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          )
          WITH CHECK (
            id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY users_delete_policy ON users
          FOR DELETE
          USING (
            id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        -- Explicit per-operation policies for user_sessions
        CREATE POLICY sessions_select_policy ON user_sessions
          FOR SELECT
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY sessions_insert_policy ON user_sessions
          FOR INSERT
          WITH CHECK (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''), user_id)
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY sessions_update_policy ON user_sessions
          FOR UPDATE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY sessions_delete_policy ON user_sessions
          FOR DELETE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );
      `);
    },
    down: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        DROP POLICY IF EXISTS users_select_policy ON users;
        DROP POLICY IF EXISTS users_insert_policy ON users;
        DROP POLICY IF EXISTS users_update_policy ON users;
        DROP POLICY IF EXISTS users_delete_policy ON users;
        DROP POLICY IF EXISTS sessions_select_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_insert_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_update_policy ON user_sessions;
        DROP POLICY IF EXISTS sessions_delete_policy ON user_sessions;
        ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
        ALTER TABLE user_sessions NO FORCE ROW LEVEL SECURITY;
      `);
    },
  },
  {
    id: '004_master_cv_and_resume_versions',
    name: 'Create master_cvs, master_cv_versions, and tailored_resume_versions with RLS',
    up: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        -- Master CV table: single active source of truth per user
        CREATE TABLE IF NOT EXISTS master_cvs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'Master CV',
          content JSONB NOT NULL DEFAULT '{}'::jsonb,
          target_role TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1,
          ats_score NUMERIC,
          ats_breakdown JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_master_cvs_user ON master_cvs(user_id);

        -- Master CV immutable version snapshots
        CREATE TABLE IF NOT EXISTS master_cv_versions (
          id TEXT PRIMARY KEY,
          master_cv_id TEXT NOT NULL REFERENCES master_cvs(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          version_number INTEGER NOT NULL,
          version_label TEXT NOT NULL DEFAULT '',
          content_snapshot JSONB NOT NULL,
          source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'autosave', 'restore', 'import'
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_mcv_version UNIQUE (master_cv_id, version_number)
        );
        CREATE INDEX IF NOT EXISTS idx_mcv_versions_user ON master_cv_versions(user_id);
        CREATE INDEX IF NOT EXISTS idx_mcv_versions_cv ON master_cv_versions(master_cv_id);

        -- Tailored resume versions: independent outputs, never mutating master CV
        CREATE TABLE IF NOT EXISTS tailored_resume_versions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          master_cv_version_id TEXT REFERENCES master_cv_versions(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          target_role TEXT NOT NULL DEFAULT '',
          target_company TEXT NOT NULL DEFAULT '',
          job_description_snapshot TEXT NOT NULL DEFAULT '',
          resume_content JSONB NOT NULL,
          ats_score NUMERIC,
          ats_breakdown JSONB,
          truth_guard_result JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tailored_resumes_user ON tailored_resume_versions(user_id);

        -- Enable and FORCE Row Level Security on all 3 tables
        ALTER TABLE master_cvs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE master_cvs FORCE ROW LEVEL SECURITY;

        ALTER TABLE master_cv_versions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE master_cv_versions FORCE ROW LEVEL SECURITY;

        ALTER TABLE tailored_resume_versions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tailored_resume_versions FORCE ROW LEVEL SECURITY;

        -- RLS Policies for master_cvs
        CREATE POLICY master_cvs_select_policy ON master_cvs
          FOR SELECT
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY master_cvs_insert_policy ON master_cvs
          FOR INSERT
          WITH CHECK (
            user_id IS NOT NULL AND (
              user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''), user_id)
              OR current_setting('app.bypass_rls', true) = 'on'
            )
          );

        CREATE POLICY master_cvs_update_policy ON master_cvs
          FOR UPDATE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          )
          WITH CHECK (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY master_cvs_delete_policy ON master_cvs
          FOR DELETE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        -- RLS Policies for master_cv_versions
        CREATE POLICY mcv_versions_select_policy ON master_cv_versions
          FOR SELECT
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY mcv_versions_insert_policy ON master_cv_versions
          FOR INSERT
          WITH CHECK (
            user_id IS NOT NULL AND (
              user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''), user_id)
              OR current_setting('app.bypass_rls', true) = 'on'
            )
          );

        CREATE POLICY mcv_versions_update_policy ON master_cv_versions
          FOR UPDATE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          )
          WITH CHECK (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY mcv_versions_delete_policy ON master_cv_versions
          FOR DELETE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        -- RLS Policies for tailored_resume_versions
        CREATE POLICY tailored_resumes_select_policy ON tailored_resume_versions
          FOR SELECT
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY tailored_resumes_insert_policy ON tailored_resume_versions
          FOR INSERT
          WITH CHECK (
            user_id IS NOT NULL AND (
              user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''), user_id)
              OR current_setting('app.bypass_rls', true) = 'on'
            )
          );

        CREATE POLICY tailored_resumes_update_policy ON tailored_resume_versions
          FOR UPDATE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          )
          WITH CHECK (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        CREATE POLICY tailored_resumes_delete_policy ON tailored_resume_versions
          FOR DELETE
          USING (
            user_id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
            OR current_setting('app.bypass_rls', true) = 'on'
          );

        -- Grant app role permissions if dedicated role exists
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'curevo_app_role') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON master_cvs, master_cv_versions, tailored_resume_versions TO curevo_app_role;
          END IF;
        END $$;
      `);
    },
    down: async (client: PoolClient) => {
      const q = asQueryable(client);
      await q.query(`
        DROP TABLE IF EXISTS tailored_resume_versions CASCADE;
        DROP TABLE IF EXISTS master_cv_versions CASCADE;
        DROP TABLE IF EXISTS master_cvs CASCADE;
      `);
    },
  },
];

/**
 * Ensure the migration tracking ledger table exists.
 */
async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  const q = asQueryable(client);
  await q.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Retrieve list of already applied migration IDs.
 */
export async function getAppliedMigrations(client?: PoolClient | Pool): Promise<string[]> {
  const q = client ? asQueryable(client) : getDb();
  try {
    const res = await q.query('SELECT id FROM schema_migrations ORDER BY applied_at ASC');
    return res.rows.map((r: { id: string }) => r.id);
  } catch {
    // If schema_migrations table doesn't exist yet, return empty list
    return [];
  }
}

/**
 * Execute all pending database migrations in sequential order.
 */
export async function runPendingMigrations(pool?: Pool): Promise<{
  applied: string[];
  skipped: string[];
}> {
  const db = pool || getDb();
  const applied: string[] = [];
  const skipped: string[] = [];

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Transaction-level advisory lock prevents concurrent instances from applying migrations simultaneously
    await client.query('SELECT pg_advisory_xact_lock(7429184)');
    await ensureMigrationsTable(client);

    const appliedIds = await getAppliedMigrations(client);

    for (const m of MIGRATIONS) {
      if (appliedIds.includes(m.id)) {
        skipped.push(m.id);
        continue;
      }

      console.log(`[Migrations] Applying ${m.id} (${m.name})...`);
      await m.up(client);
      await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
      applied.push(m.id);
      console.log(`[Migrations] Successfully applied ${m.id}.`);
    }

    await client.query('COMMIT');
    return { applied, skipped };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Roll back the most recently applied migration.
 */
export async function rollbackLastMigration(pool?: Pool): Promise<string | null> {
  const db = pool || getDb();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Transaction-level advisory lock prevents concurrent instances from applying migrations simultaneously
    await client.query('SELECT pg_advisory_xact_lock(7429184)');
    await ensureMigrationsTable(client);

    const appliedIds = await getAppliedMigrations(client);
    if (appliedIds.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const lastId = appliedIds[appliedIds.length - 1];
    const migration = MIGRATIONS.find((m) => m.id === lastId);
    if (!migration) {
      throw new Error(`Cannot rollback unknown migration ${lastId}`);
    }

    console.log(`[Migrations] Rolling back ${migration.id} (${migration.name})...`);
    await migration.down(client);
    await client.query('DELETE FROM schema_migrations WHERE id = $1', [lastId]);
    await client.query('COMMIT');
    console.log(`[Migrations] Rolled back ${migration.id}.`);
    return lastId;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
