# Curevo AI — Phase 9C: Authentication & Database Foundation Report
**Engineering Milestone Deliverable**
**Date:** November 4, 2026
**Commit Baseline:** `154b879c1fe3746f328098aaccb230aa8741585a`
**Status:** Verification Succeeded (100% Tests Green, Production Builds Verified)

---

## 1. Executive Summary

Phase 9C replaces the temporary login-free stateless mode with a production-ready, security-hardened authentication and database foundation while fully preserving the instant, login-free public builder workflow (`/builder`, `/ats`, `/check-ats`).

Key architectural achievements in Phase 9C:
1. **PostgreSQL Database Connection & Migration Engine**:
   - Connection pool management (`server/src/db/db.ts`) with graceful shutdown, health probing (`checkDatabaseHealth()`), and fail-closed error interception (`AUTH_UNAVAILABLE` 503).
   - Reversible schema migration runner (`server/src/db/migrations.ts`) with a dedicated `schema_migrations` ledger.
   - Applied Migration `001_baseline_identity_schema`: tables `users`, `user_sessions`, `email_verification_tokens`, `password_reset_tokens`.
   - Applied Migration `002_row_level_security_policies`: enabled PostgreSQL Row Level Security (RLS) on identity tables with tenant isolation policies.
2. **Data Access Repository (`server/src/db/userRepository.ts`)**:
   - Centralized, strongly-typed abstraction for user creation, credential validation, email verification, and profile management.
3. **Dual-Revocation Session & Security Architecture**:
   - Per-device session revocation via `user_sessions.id` (`jti` claim).
   - Instant all-device revocation on password change or password reset via `users.session_version` (`sv` claim).
   - Single-use hashed email verification and password reset tokens with strict expiry windows (24h verification, 1h reset).
4. **Account-Isolated Local Draft Storage & Anonymous Import (`web/src/lib/draftStorage.ts`)**:
   - Multi-user scoped keys: `curevo_builder_draft_v1_usr_${userId}` vs `curevo_builder_draft_v1_anonymous`.
   - Guaranteed isolation between User A and User B.
   - Explicit, user-confirmed anonymous draft import banner in `PublicBuilder.tsx` to prevent cross-account leakage or accidental overwriting.
5. **Frontend State & Route Restoration**:
   - Real `AuthContext.tsx` with session restoration (`GET /api/auth/me`), `loading` indicators, and safe error fallbacks.
   - Protected route component (`<ProtectedRoute>`) with spinner and login redirection.
   - Mounted routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/onboarding`, `/app`.
   - Maintained 100% backward compatibility for public builder routes (`/`, `/builder`, `/ats`, `/check-ats`, `/tailor`).

---

## 2. Database Schema & Migration Ledger

### 2.1 Ledger Table: `schema_migrations`
Migrations are executed transactionally and recorded in `schema_migrations`:
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Baseline Tables & Indexes (`001_baseline_identity_schema`)
- **`users`**:
  - `id`: `VARCHAR(64) PRIMARY KEY` (prefixed with `usr_`)
  - `email`: `VARCHAR(255) UNIQUE NOT NULL` (indexed with `lower(email)`)
  - `password_hash`: `VARCHAR(255) NOT NULL` (bcrypt, 10 rounds)
  - `name`: `VARCHAR(255) NOT NULL`
  - `target_role`: `VARCHAR(150)`
  - `onboarded`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `email_verified`: `BOOLEAN NOT NULL DEFAULT FALSE`
  - `session_version`: `INTEGER NOT NULL DEFAULT 0`
  - `role`: `VARCHAR(32) NOT NULL DEFAULT 'USER'`
  - `created_at`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **`user_sessions`**:
  - `id`: `VARCHAR(64) PRIMARY KEY` (`ses_`)
  - `user_id`: `VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `created_at`, `last_active_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `revoked_at`: `TIMESTAMPTZ NULL`
  - Index: `idx_user_sessions_user_id (user_id)`
- **`email_verification_tokens`**:
  - `token_hash`: `VARCHAR(64) PRIMARY KEY` (SHA-256)
  - `user_id`: `VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `expires_at`: `TIMESTAMPTZ NOT NULL`
  - `consumed_at`: `TIMESTAMPTZ NULL`
- **`password_reset_tokens`**:
  - `token_hash`: `VARCHAR(64) PRIMARY KEY` (SHA-256)
  - `user_id`: `VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `expires_at`: `TIMESTAMPTZ NOT NULL`
  - `consumed_at`: `TIMESTAMPTZ NULL`

### 2.3 Row Level Security (`002_row_level_security_policies`)
RLS is enabled on `users` and `user_sessions`:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
```
Tenant isolation policies restrict row visibility based on `current_setting('app.current_user_id', true)`:
```sql
CREATE POLICY users_isolation_policy ON users
  USING (id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN');

CREATE POLICY user_sessions_isolation_policy ON user_sessions
  USING (user_id = current_setting('app.current_user_id', true) OR current_setting('app.current_user_role', true) = 'ADMIN');
```

---

## 3. Authentication Architecture & Security Invariants

### 3.1 Dual Revocation Mechanism
1. **Device Level (Single Session)**:
   - When logging in or registering, a new row is inserted into `user_sessions` (`ses_...`).
   - The issued JWT carries `{ uid, email, sv, jti: sessionId }`.
   - `requireAuth` middleware verifies `user_sessions.revoked_at IS NULL`.
   - Calling `POST /api/auth/logout` sets `revoked_at = NOW()` on that specific session row and clears the cookie.
2. **User Level (All Devices)**:
   - When a password is changed or reset, `users.session_version` is atomically incremented (`session_version = session_version + 1`).
   - Any token presented with `sv < current session_version` is rejected immediately (`401 TOKEN_VERSION_EXPIRED`).

### 3.2 Single-Use Cryptographic Tokens
- Raw tokens are 32-byte hex strings generated via `crypto.randomBytes(32)`.
- Only the SHA-256 hash is persisted in `email_verification_tokens` and `password_reset_tokens`.
- Consuming a token updates `consumed_at = NOW()`. Subsequent attempts are rejected with `TOKEN_USED` or `TOKEN_EXPIRED`.

### 3.3 Fail-Safe Error Handling
- When `DATABASE_URL` is missing or the database is unreachable, the system fails closed safely:
  - Auth routes respond with HTTP 503 `AUTH_UNAVAILABLE: "Authentication services are temporarily unavailable."`
  - Internal database credentials, hostnames, and stack traces are completely masked by `errorHandler`.
  - Public stateless endpoints (`/api/public/ats`, `/api/public/improve`, `/api/public/pdf`) continue functioning with 100% availability.

---

## 4. Multi-User Draft Isolation & Local Storage Architecture

### 4.1 Storage Key Namespaces
- Anonymous draft: `curevo_builder_draft_v1_anonymous` (with fallback to legacy `curevo_builder_draft_v1`)
- Authenticated account: `curevo_builder_draft_v1_usr_${userId}`

### 4.2 Explicit Anonymous Draft Import Workflow
When an unauthenticated user designs a resume in `/builder` and subsequently logs in or signs up:
1. `PublicBuilder.tsx` detects that `user` is authenticated and `hasAnonymousDraft()` is true.
2. An interactive import banner is displayed:
   `"Unsaved draft found: You have a resume draft created before signing in. Would you like to import it to your account (user@example.com)?"`
3. If the user clicks **Import to My Account**:
   - `importAnonymousDraftToAccount(user.id)` writes the draft to `curevo_builder_draft_v1_usr_${user.id}`.
   - Cleans up `curevo_builder_draft_v1_anonymous` and `curevo_builder_draft_v1`.
   - Restores the state and updates the status toast.
4. If the user clicks **Discard**:
   - `discardAnonymousDraft()` purges the anonymous draft without altering the account's existing draft.
5. In conflict situations, the application **never** silently merges or overwrites drafts.

---

## 5. Automated Verification Results

### 5.1 Web Workspace Tests
- **Test Command:** `cd web && npm test`
- **Results:** 8 test files passed, 112 tests passed (0 failed).
- **Suites:**
  - `tests/draftAccountIsolation.test.ts` (6 tests passed)
  - `tests/draftStorage.test.ts` (8 tests passed)
  - `tests/logout.test.ts` (4 tests passed)
  - `tests/atsCheckerWorkflow.test.ts` (7 tests passed)
  - `tests/apiBase.test.ts` (6 tests passed)
  - `tests/sampleJdPresets.test.ts` (7 tests passed)
  - `tests/writingCoach.test.ts` (10 tests passed)
  - `tests/publicBuilder.test.ts` (64 tests passed)
- **Typecheck & Production Build:**
  - `tsc --noEmit`: 0 errors.
  - `vite build`: Succeeded in 4.03s (`dist/index.html` 1.99 kB, `dist/assets/index-DQ_QoLQQ.js` 458.38 kB).

### 5.2 Server Workspace Tests
- **Test Command:** `cd server && npx vitest run`
- **Results:** 22 test files passed, 363 passed, 15 skipped (0 failed).
- **PostgreSQL Integration Suite:**
  - `npx vitest run tests/phase9c_auth_database.test.ts --config vitest.integration.config.ts`:
  - 16 tests passed against live PostgreSQL 15.19:
    1. Migration ledger initialization & RLS policy application.
    2. User registration (`POST /api/auth/signup`) with bcrypt hashing.
    3. Duplicate email rejection (`HTTP 409 EMAIL_TAKEN`).
    4. Short password rejection (`HTTP 400`).
    5. Malformed payload rejection (`HTTP 400 MALFORMED_JSON`).
    6. User login (`POST /api/auth/login`) with session cookie issuance.
    7. Wrong password rejection (`HTTP 401 INVALID_CREDENTIALS`).
    8. Non-existent email rejection (`HTTP 401 INVALID_CREDENTIALS`).
    9. Session restoration (`GET /api/auth/me`).
    10. Rejection of unauthenticated requests (`HTTP 401 NOT_AUTHENTICATED`).
    11. Logout (`POST /api/auth/logout`) with per-device session row revocation.
    12. Single-use email verification token consumption.
    13. Rejection of consumed verification tokens (`HTTP 400 TOKEN_USED`).
    14. Password reset with dual revocation (session_version invalidating all sessions).
    15. Rejection of consumed password reset tokens.
    16. Cross-user data isolation via `UserRepository`.
- **Typecheck & Production Build:**
  - `tsc -p tsconfig.build.json`: Succeeded with 0 errors.

---

## 6. Git Working Tree & Release Discipline

### 6.1 Clean File Modifications
- **Modified Source Files (10 files)**:
  - `server/src/app.ts`
  - `server/src/db/db.ts`
  - `server/src/index.ts`
  - `server/src/middleware/errors.ts`
  - `server/tests/stateless-foundation.test.ts`
  - `server/vitest.config.ts`
  - `server/vitest.integration.config.ts`
  - `web/src/App.tsx`
  - `web/src/pages/PublicBuilder.tsx`
  - `web/src/state/AuthContext.tsx`
- **New Source Files (6 files)**:
  - `server/src/db/migrations.ts`
  - `server/src/db/userRepository.ts`
  - `server/tests/phase9c_auth_database.test.ts`
  - `web/src/components/ProtectedRoute.tsx`
  - `web/tests/draftAccountIsolation.test.ts`
  - `web/tests/draftStorage.test.ts`
- **Untracked QA Scripts Preserved (19 files)**:
  - Untracked QA scripts in `server/tests/` were preserved intact without deletion.
- **Strict Guardrails**:
  - No changes committed or pushed to GitHub.
  - No deployment initiated to Render or Vercel.
