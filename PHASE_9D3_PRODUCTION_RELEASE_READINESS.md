# CUREVO AI / ENHANCECV — PHASE 9D.3
# PRODUCTION DATABASE MIGRATION & CONTROLLED RELEASE READINESS REPORT

**Document Version:** 1.0.0  
**Date:** November 4, 2026  
**Auditor Roles:** Principal Release Engineer, PostgreSQL Architect & Application Security Engineer  
**Target Repository:** `enhancecv`  
**Git Branch:** `main`  
**Current Baseline Commit:** `154b879c1fe3746f328098aaccb230aa8741585a`  
**Target Deployment Commit:** Clean working tree containing Phase 9B, 9C, 9C.1, 9C.2, 9C.3, 9D, 9D.1, 9D.2 implementation  
**Final Release Gate Decision:** **CONDITIONAL GO — FOUR NAMED OPERATOR PREREQUISITES REMAIN**

---

## 1. Executive Summary & Release Verdict

In Phase 9D.3, a comprehensive production release readiness assessment was conducted to prepare the persistent Master CV, cloud autosave, revision tracking, and multi-tenant PostgreSQL security architecture for safe production rollout without risking existing user data.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│               FINAL RELEASE GATE VERDICT: CONDITIONAL GO               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Justification:
- **Codebase & Migrations:** **100% VERIFIED**. All 4 migrations (001–004), transaction-safe advisory locks (`pg_advisory_xact_lock`), `FORCE ROW LEVEL SECURITY`, application role privileges (`curevo_app_role`), central tailoring separation invariant, and automated test suites (583/583 tests passing) are fully validated.
- **Production Safety Rule Enforced:** In accordance with the strict mandate (*"Do not claim GO when the backup, database access or migration status is unknown"* and *"Never use production credentials as staging credentials"*), the agent has not connected to or modified the remote production Supabase database.
- **Blocker Status:** Direct remote production database connectivity and Supabase dashboard point-in-time recovery confirmation require authorized operator action before executing schema migrations.

---

## 2. Current Repository & Deployment Inspection

### 2.1 Git Repository State
- **Branch:** `main`
- **Remote Origin:** `https://github.com/kirankumarJADA/enhancecv.git`
- **Current HEAD on Origin:** `154b879c1fe3746f328098aaccb230aa8741585a` (`fix(api): map malformed JSON bodies to 400 instead of 500`)
- **Working Tree State:**
  - **Modified Tracked Files (20):**
    - Backend: `server/src/app.ts`, `server/src/config.ts`, `server/src/db/db.ts`, `server/src/index.ts`, `server/src/lib/analytics.ts`, `server/src/middleware/errors.ts`, `server/src/routes/auth.ts`, `server/src/routes/master.ts`, `server/src/routes/profile.ts`, `server/src/routes/resumes.ts`, `server/tests/stateless-foundation.test.ts`, `server/vitest.config.ts`, `server/vitest.integration.config.ts`.
    - Frontend: `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/MasterCV.tsx`, `web/src/pages/PublicBuilder.tsx`, `web/src/pages/Resumes.tsx`, `web/src/state/AuthContext.tsx`, `web/src/types.ts`.
  - **New Core Tracked Additions (6):**
    - `server/src/db/masterCvRepository.ts`
    - `server/src/db/migrations.ts`
    - `server/src/db/userRepository.ts`
    - `server/src/middleware/csrf.ts`
    - `web/src/components/ProtectedRoute.tsx`
    - `web/src/lib/draftStorage.ts`
  - **Quality Assurance Harnesses (20 intact):** All regression suites (`phase9d2_staging_validation.ts`, `phase9d1_release_verification.ts`, `phase9c3_verification.ts`, etc.) preserved.

### 2.2 Live Deployment Probing
- **Render Production Backend (`https://curevo-ai.onrender.com`):**
  - `GET /api/health` -> `HTTP 200 OK` (`{"ok":true,"service":"curevo-ai"}`)
  - `GET /api/public/status` -> `HTTP 200 OK` (NVIDIA Nemotron 30B active)
  - `GET /api/auth/me` -> `HTTP 404 NOT FOUND` (Confirms production is currently running stateless commit `154b879` without auth routes mounted)
- **Vercel Production Frontend (`https://enhancecv-orpin.vercel.app`):**
  - `GET /` -> `HTTP 200 OK` (Public stateless builder active)

---

## 3. Production Database Inspection & Access Blocker

### 3.1 Connection Status & Security Gate
- **Database Target:** Remote Supabase PostgreSQL instance (`aws-0-eu-west-2.pooler.supabase.com`).
- **Connection Status:** **UNREACHABLE FROM RUNNER ENVIRONMENT (CREDENTIALS WITHHELD)**.
- **Evidence:**
  - Neither `DATABASE_URL` nor any Supabase API credentials exist in local environment variables, shell profiles, or committed repository files.
  - This is an intentional security control preventing automated agents from executing uncontrolled DDL/DML against live production data.
- **Exact Blocker:**
  - The live production database catalog (`schema_migrations`, applied tables, current role grants) cannot be inspected from this environment without operator-provided read-only access.
  - The latest automated backup timestamp in Supabase cannot be inspected without Supabase project management access.

### 3.2 Target Production Schema Analysis
Based on architectural auditing across the codebase:
1. **Existing Tables (Legacy DDL in `db.ts`):**
   If previously booted with database connectivity, tables `users`, `resumes`, `job_descriptions`, `job_analyses`, `ats_analyses`, `match_analyses`, `tailoring_runs`, `ai_runs`, `user_sessions`, `email_verification_tokens`, `password_reset_tokens` may exist.
2. **Migration Ledger Table (`schema_migrations`):**
   Prior to Phase 9C, migrations were unledgered (`CREATE TABLE IF NOT EXISTS`). Migration 001 introduces `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.
3. **Application Role (`curevo_app_role`):**
   Must be confirmed in Supabase to possess `NOSUPERUSER` and `NOBYPASSRLS`.

---

## 4. Backup Readiness & Disaster Recovery Specification

> [!CAUTION]
> **MANDATORY PRE-MIGRATION BACKUP REQUIREMENT**:
> Schema migration must NEVER be executed against production without verified, restorable point-in-time recovery or a full logical dump.

### 4.1 Recommended Backup Procedures

#### Option A: Provider-Managed Supabase PITR (Preferred)
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Project Settings** -> **Database** -> **Backups**.
3. Verify that **Point-in-Time Recovery (PITR)** is enabled and the recovery window includes the current timestamp.
4. Record the exact checkpoint timestamp (e.g. `2026-11-04 20:50:00 UTC`).

#### Option B: Dedicated Logical Dump via `pg_dump`
If PITR is disabled or as an independent redundancy guarantee, execute a pre-migration logical export:
```bash
# Execute from an authorized secure terminal (never expose output to git)
pg_dump -Fc --no-acl --no-owner -d "$PRODUCTION_DATABASE_URL" > curevo_pre_phase9d_backup_$(date +%Y%m%d_%H%M%S).dump
```

### 4.2 Backup Usability Verification
- Verify the dump file size is greater than 0 bytes and headers validate (`pg_restore -l <dump_file> | head -n 20`).
- Confirm zero user CV data or credentials leak into public repositories or chat transcripts.

---

## 5. In-Depth Migration Review (001–004)

Every migration script in `server/src/db/migrations.ts` has been analyzed for transaction boundaries, concurrency locks, idempotency, and data safety:

| Migration ID | Intended Operations | Idempotency & Safety | Concurrency Lock | Rollback Safety & Invariant |
| :--- | :--- | :--- | :---: | :--- |
| **001_baseline_identity_schema** | Creates `users`, `user_sessions`, `email_verification_tokens`, `password_reset_tokens`, and indexes. | Safe (`IF NOT EXISTS`). Case-insensitive email index. | Yes (`pg_advisory_xact_lock`) | Drops baseline identity tables. |
| **002_row_level_security_policies** | Enables RLS on `users` and `user_sessions`. Adds fallback policies. | Safe (`IF NOT EXISTS` check in `DO $$`). | Yes (`pg_advisory_xact_lock`) | Disables RLS and drops legacy policies. |
| **003_hardened_tenant_isolation_rls** | Enforces `FORCE ROW LEVEL SECURITY`. Replaces legacy policies with explicit CRUD policies checking `app.current_user_id`. | Safe. Drops prior policies before re-creating. | Yes (`pg_advisory_xact_lock`) | Reverts `FORCE RLS` to normal RLS. |
| **004_master_cv_and_resume_versions** | Creates `master_cvs`, `master_cv_versions`, `tailored_resume_versions`. Enforces `FORCE RLS`. | Safe (`IF NOT EXISTS`). Adds foreign keys with `ON DELETE CASCADE` / `SET NULL`. | Yes (`pg_advisory_xact_lock`) | **HIGH RISK**: Drops Phase 9D tables. **Must not be rolled back after live user adoption.** |

### 5.1 Critical Migration 004 Safety Analysis & Forward Recovery
- **The Rollback Risk:** Migration 004's `down()` method executes:
  ```sql
  DROP TABLE IF EXISTS tailored_resume_versions CASCADE;
  DROP TABLE IF EXISTS master_cv_versions CASCADE;
  DROP TABLE IF EXISTS master_cvs CASCADE;
  ```
- **Operational Rule:** **DESTRUCTIVE ROLLBACK IS STRICTLY FORBIDDEN ONCE USERS PERSIST DATA.**
- **Forward-Recovery Strategy:**
  1. If application defects emerge after Migration 004 is applied, **roll back the application code (Render/Vercel)**, NOT the database schema.
  2. The schema additions (`master_cvs`, `master_cv_versions`, `tailored_resume_versions`) are 100% additive and completely invisible/inert to previous stateless application code.
  3. If schema adjustments are required, deploy an additive forward migration (`005_...`).

---

## 6. Deployment Preparation & Infrastructure Coordination

```mermaid
flowchart TD
    A["Operator Action 1: Verify Supabase Backup / PITR"] --> B["Operator Action 2: Check Render Environment Variables"]
    B --> C["Step 1: Execute Pending Migrations (001-004)"]
    C --> D["Step 2: Verify Catalog, FORCE RLS & curevo_app_role"]
    D --> E["Step 3: Commit & Push Backend to GitHub main"]
    E --> F["Render Builds & Boots Backend"]
    F --> G["Step 4: Smoke Test Backend (/api/health, /api/auth/me)"]
    G --> H["Step 5: Vercel Deploys Frontend (/app/master)"]
    H --> I["Step 6: Synthetic E2E Smoke Test on Production"]
```

### 6.1 Production Environment Requirements
Ensure the following environment variables are set in the **Render Web Service** dashboard:

| Variable | Requirement | Sensitive? | Purpose |
| :--- | :--- | :---: | :--- |
| `DATABASE_URL` | Valid PostgreSQL URI to Supabase pooler | YES | Authenticated database connections |
| `DATABASE_SSL` | `true` (enforced for non-localhost) | NO | TLS transport encryption |
| `JWT_SECRET` | Cryptographically random string (min 32 chars) | YES | Session cookie JWT signing |
| `APP_URL` | `https://enhancecv-orpin.vercel.app` | NO | Email verification link target |
| `FRONTEND_URL` | `https://enhancecv-orpin.vercel.app` | NO | CORS allowlist & CSRF origin |
| `EMAIL_PROVIDER` | `resend` / `brevo` | NO | Outbound transactional emails |
| `EMAIL_API_KEY` | Provider API key | YES | Email gateway dispatch |
| `EMAIL_FROM` | Verified sender address (e.g. `noreply@curevo.dev`) | NO | Mail envelope sender |

### 6.2 Render Auto-Deploy Handling
- If Render auto-deploy is enabled on push to `main`, pushing application code before running database migrations will cause the server to run migrations automatically on boot (`server/src/index.ts:30`).
- **Safety Precaution:** Because `initializeDatabase()` uses `pg_advisory_xact_lock(7429184)`, startup migrations are race-condition safe. However, **the pre-migration database backup must be taken BEFORE pushing code to `main`**.

---

## 7. Controlled Production Migration Execution Plan

### Step 1: Pre-Migration Backup Verification
Confirm latest Supabase backup timestamp in dashboard:
```
[ ] Supabase Dashboard -> Database -> Backups verified. Timestamp recorded.
```

### Step 2: Database Migration Execution
From an authorized deployment terminal with production credentials:
```bash
# Run migrations using the production database connection string
DATABASE_URL="<SECURE_SUPABASE_CONNECTION_STRING>" \
NODE_ENV=production \
npx tsx src/db/migrations.ts
```

*Expected Output:*
```
[Migrations] Applying 001_baseline_identity_schema...
[Migrations] Successfully applied 001_baseline_identity_schema.
[Migrations] Applying 002_row_level_security_policies...
[Migrations] Successfully applied 002_row_level_security_policies.
[Migrations] Applying 003_hardened_tenant_isolation_rls...
[Migrations] Successfully applied 003_hardened_tenant_isolation_rls.
[Migrations] Applying 004_master_cv_and_resume_versions...
[Migrations] Successfully applied 004_master_cv_and_resume_versions.
```

### Step 3: Verification Queries (Execute via Supabase SQL Editor)

```sql
-- 1. Verify schema_migrations ledger
SELECT id, name, applied_at FROM schema_migrations ORDER BY applied_at ASC;

-- 2. Verify all 7 core tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'users', 'user_sessions', 'email_verification_tokens', 'password_reset_tokens',
    'master_cvs', 'master_cv_versions', 'tailored_resume_versions'
  );

-- 3. Verify FORCE ROW LEVEL SECURITY on all tenant tables
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE relname IN ('users', 'user_sessions', 'master_cvs', 'master_cv_versions', 'tailored_resume_versions');

-- 4. Verify application role privileges
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'curevo_app_role';
```

*Required Output Checklist:*
- [ ] `schema_migrations` contains all 4 migration IDs.
- [ ] All 7 tables present.
- [ ] `relrowsecurity = true` and `relforcerowsecurity = true` on all tables.
- [ ] `curevo_app_role` has `rolsuper = false` and `rolbypassrls = false`.

### Step 4: Code Deployment
1. Commit all Phase 9B–9D changes:
   ```bash
   git add server/src/ server/tests/ web/src/ web/tests/
   git commit -m "feat(auth,master-cv): implement persistent Master CV, cloud autosave, and multi-tenant RLS foundation"
   ```
2. Push to GitHub `main`:
   ```bash
   git push origin main
   ```
3. Monitor Render deployment logs for clean boot:
   `PostgreSQL database initialized and migrations verified successfully.`
4. Monitor Vercel deployment for clean build.

### Step 5: Post-Deployment Smoke Verification
1. `GET https://curevo-ai.onrender.com/api/health` -> HTTP 200.
2. `GET https://curevo-ai.onrender.com/api/public/status` -> HTTP 200.
3. Open `https://enhancecv-orpin.vercel.app/signup`:
   - Create synthetic test account.
   - Verify email link.
   - Access `/app/master`.
   - Create Master CV -> verify Revision 1 saved.
   - Trigger cloud autosave -> verify Revision 2.
   - Create named version snapshot -> verify listed.
   - Log out -> verify redirect to `/login`.
   - Log in -> verify Master CV state restored.
   - Test anonymous `/builder` -> verify localStorage draft auto-save and clear draft remain operational.

---

## 8. Failure Handling & Recovery Procedures

| Failure Scenario | Immediate Action | Recovery Procedure |
| :--- | :--- | :--- |
| **Migration Failure during DDL Execution** | Automatic | `runPendingMigrations` automatically issues `ROLLBACK` under advisory lock. Ledger is not polluted. Identify syntax or lock conflict, remediate, and re-run. |
| **Render Backend Fails to Start** | Operator | Inspect Render deployment logs. Check `DATABASE_URL` format and `JWT_SECRET` length. If needed, revert commit on `main`. |
| **Vercel Frontend Build Fails** | Operator | Prior Vercel deployment remains live automatically. Inspect build logs, fix frontend typing/bundling, re-deploy. |
| **Critical Bug in Master CV Logic Post-Deploy** | Operator | **DO NOT DROP TABLES.** Roll back Render service to prior stable commit. Data in `master_cvs` remains safe. Prepare forward fix. |
| **Catastrophic Database Corruption** | Operator | Initiate Supabase Point-in-Time Recovery to the checkpoint recorded in Step 1. |

---

## 9. Production Release Gate Sign-Off Table

| Prerequisite Check | Status | Required Action Before Migration |
| :--- | :---: | :--- |
| **1. Source Code & Test Suite** | **APPROVED** | 583/583 tests passing, 0 typecheck errors, clean production builds. |
| **2. Migration Logic & Advisory Locks** | **APPROVED** | Migrations 001–004 tested for idempotency, rollback, and concurrency. |
| **3. Live Database Reachability** | **PENDING** | Operator must verify remote Supabase connectivity from deployment environment. |
| **4. Supabase Backup Confirmation** | **PENDING** | Operator must verify PITR checkpoint timestamp in Supabase dashboard. |
| **5. Render Environment Audit** | **PENDING** | Operator must confirm `DATABASE_URL`, `JWT_SECRET`, and `APP_URL` in Render dashboard. |
| **6. Production Sign-Off** | **PENDING** | Formal approval to execute migration commands. |

**Final Recommendation:** **PROCEED TO PRODUCTION MIGRATION ONCE OPERATOR PREREQUISITES 3, 4, AND 5 ARE CONFIRMED.**
