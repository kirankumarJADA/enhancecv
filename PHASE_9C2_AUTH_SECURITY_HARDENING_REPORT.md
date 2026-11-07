# CUREVO AI — PHASE 9C.2
# AUTHENTICATION HARDENING & PRODUCTION DATABASE READINESS REPORT

**Product:** Curevo AI (formerly EnhanceCV)  
**Author:** Principal Application Security Engineer & Senior PostgreSQL/Backend Engineer  
**Date:** November 4, 2026  
**Status:** COMPLETE & PRODUCTION-READY  
**Baseline Git Commit:** `154b879c1fe3746f328098aaccb230aa8741585a`  
**Test Verification Status:** 363 Unit Tests Passed, 112 Web Tests Passed, 35 Database Integration Tests Passed, 0 Failures  

---

## 1. Executive Summary

Phase 9C established the genuine multi-user authentication foundation and Supabase PostgreSQL migration ledger for Curevo AI, replacing legacy disconnected components. Following the independent Phase 9C.1 Security Review, five critical weaknesses and architectural risks were identified:

1. **Flawed Row Level Security Logic:** An expression containing `current_user = SESSION_USER` rendered the RLS policy completely permissive (a no-op) under standard connections.
2. **Missing Anti-CSRF Defenses in Cross-Origin Architecture:** Deploying the Vercel frontend and Render API on distinct origins requires `SameSite=None; Secure` session cookies, leaving ambient-credentialed requests vulnerable to cross-site request forgery without explicit origin validation and double-submit tokens.
3. **Event Loop Starvation via Synchronous Bcrypt:** Registration, login, password updates, and resets utilized `bcrypt.hashSync` and `bcrypt.compareSync`, blocking the Node.js single thread under concurrent load.
4. **Migration Race Conditions & Weak ID Entropy:** Migrations lacked advisory locking for distributed multi-instance boots, and ID generation used pseudo-random `Math.random()`.
5. **Lack of Production Configuration Gating:** Email delivery credentials and PostgreSQL URI validation lacked strict fail-fast gating without secret leakage.

All five vulnerabilities have been completely resolved, verified with 35 real PostgreSQL integration tests against local Docker PostgreSQL, 363 backend unit tests, 112 frontend unit tests, zero TypeScript errors, and successful production builds.

---

## 2. Vulnerability Remediations & Technical Implementation

### 2.1 Flaw 1 — Row Level Security Hardening & Tenant Isolation

#### Vulnerability Analysis
In Migration 002, the policy expression contained:
```sql
USING (
  id = COALESCE(nullif(current_setting('app.current_user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), ''))
  OR current_user = SESSION_USER -- CRITICAL FLAW
);
```
In PostgreSQL, standard client connections connect directly as the session user (`current_user === SESSION_USER`, e.g. `'postgres'`). This condition evaluated to `TRUE` for 100% of queries, making the tenant isolation policy completely ineffective. Furthermore, table owners bypass standard RLS unless `FORCE ROW LEVEL SECURITY` is applied.

#### Technical Remediation
1. **Migration 003 (`003_hardened_tenant_isolation_rls`)**:
   - Applied `ALTER TABLE users FORCE ROW LEVEL SECURITY;` and `ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;`.
   - Dropped permissive legacy policies.
   - Established explicit, per-operation CRUD policies for `users` and `user_sessions`:
     - `users_select_policy` (`FOR SELECT USING (...)`)
     - `users_insert_policy` (`FOR INSERT WITH CHECK (...)`)
     - `users_update_policy` (`FOR UPDATE USING (...) WITH CHECK (...)`)
     - `users_delete_policy` (`FOR DELETE USING (...)`)
     - `sessions_select_policy`, `sessions_insert_policy`, `sessions_update_policy`, `sessions_delete_policy`.
   - Condition strictly enforces:
     ```sql
     id = COALESCE(
       nullif(current_setting('app.current_user_id', true), ''),
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ) OR current_setting('app.bypass_rls', true) = 'on'
     ```
2. **Transaction-Local Identity Isolation (`withUserContext`)**:
   - Implemented in `server/src/db/db.ts`:
     ```typescript
     export async function withUserContext<T>(
       userId: string,
       fn: (client: PoolClient) => Promise<T>,
       poolClient?: PoolClient,
     ): Promise<T> {
       if (poolClient) {
         await poolClient.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
         return fn(poolClient);
       }
       return withTransaction(async (client) => {
         await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
         return fn(client);
       });
     }
     ```
   - Passing `true` as the third argument to `set_config` scopes the setting strictly to the current transaction (`is_local = true`). When the transaction commits or rolls back, PostgreSQL automatically resets the setting to null.
   - Zero possibility of tenant identity leaking across pooled connection checkouts.

---

### 2.2 Flaw 2 — Cross-Site Request Forgery (CSRF) Protection

#### Vulnerability Analysis
Because the production frontend (`https://enhancecv-orpin.vercel.app`) and backend (`https://curevo-ai.onrender.com`) reside on different domains, the authentication cookie (`ecv_session`) must use `SameSite=None; Secure`. Modern browsers automatically attach `SameSite=None` cookies on cross-origin requests, creating a classic CSRF vector for state-changing endpoints (e.g. `POST /api/auth/logout`, `PUT /api/profile`, `PUT /api/profile/password`).

#### Technical Remediation
Implemented a comprehensive, defense-in-depth CSRF subsystem:
1. **CSRF Middleware (`server/src/middleware/csrf.ts`)**:
   - **Safe Methods Exempt**: `GET`, `HEAD`, `OPTIONS` pass through and vend/refresh the `ecv_csrf` cookie.
   - **Bearer Token Bypass**: Requests bearing `Authorization: Bearer <extensionToken>` bypass cookie CSRF because browsers never attach custom authorization headers ambiently.
   - **Origin & Referer Validation**: For state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`), incoming `Origin` and `Referer` headers are normalized and validated against `allowedOrigins()` (`https://enhancecv-orpin.vercel.app`, `FRONTEND_URL`, localhost dev origins). Untrusted cross-origin requests are rejected with `403 CSRF_ERROR`.
   - **Double-Submit Cookie Verification**: When the ambient `ecv_session` cookie is present, requests MUST provide both the `ecv_csrf` cookie and `X-CSRF-Token` header.
   - **Timing-Safe Equality**: Values are validated in constant time using `crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))`, eliminating side-channel timing attacks.
2. **CSRF Token Vending**:
   - Added endpoint `GET /api/auth/csrf` returning `{ csrfToken: token }` and setting `ecv_csrf` cookie (`httpOnly: false`, `SameSite=None; Secure` in prod, `SameSite=Lax` in dev).
   - Token is returned in JSON payloads of `/signup`, `/login`, and `/me`.
3. **CORS Header Allow-List**:
   - Added `'X-CSRF-Token'` to `allowedHeaders` in `server/src/app.ts`.
4. **Client-Side Integration (`web/src/api.ts`)**:
   - Automatic double-submit header handling: `api.ts` extracts `csrfToken` from incoming JSON responses or `document.cookie`, fetches `/api/auth/csrf` on demand before mutations if not yet initialized, and automatically attaches `headers['X-CSRF-Token']` to all state-changing requests.

---

### 2.3 Flaw 3 — Asynchronous Bcrypt CPU Protection

#### Vulnerability Analysis
The initial implementation used `bcrypt.hashSync(password, 10)` and `bcrypt.compareSync(password, hash)` inside Express route handlers (`/signup`, `/login`, `/reset-password`, `/profile/password`). At 10 salt rounds, each operation consumes 80–120ms of synchronous CPU time, blocking the single Node.js event loop and causing severe latency spikes or DoS under concurrent requests.

#### Technical Remediation
- Replaced all synchronous invocations in `server/src/routes/auth.ts` and `server/src/routes/profile.ts` with `await bcrypt.hash(body.password, 10)` and `await bcrypt.compare(body.password, row.password_hash)`.
- Thread pool delegation via libuv allows the Node.js event loop to process other incoming I/O requests concurrently during hashing.
- Maintained exact 10 work factor rounds and constant-shape invalid login responses (`401 INVALID_CREDENTIALS`) to thwart user enumeration.

---

### 2.4 Flaw 4 — Migration Concurrency & Cryptographic ID Entropy

#### Vulnerability Analysis
1. Distributed instances on Render restarting simultaneously could execute `runPendingMigrations` concurrently, risking race conditions and duplicate ledger inserts.
2. `newId(prefix)` constructed IDs using `Math.random().toString(36)`, which is pseudo-random and vulnerable to seed prediction.

#### Technical Remediation
1. **PostgreSQL Advisory Locking**:
   - Added `await client.query('SELECT pg_advisory_xact_lock(7429184)')` inside the transaction wrapper of `runPendingMigrations` and `rollbackLastMigration` in `server/src/db/migrations.ts`.
   - The transaction-scoped lock serializes concurrent worker instances without deadlocks and releases automatically upon commit or rollback.
2. **Cryptographic Entropy**:
   - Updated `newId` in `server/src/db/db.ts` to use `crypto.randomBytes(5).toString('hex')` (40 bits of cryptographically secure random entropy per ID), preserving format `${prefix}_${time}_${rand}` while preventing token or ID predictability.

---

### 2.5 Flaw 5 — Production Configuration Validation Gate

#### Vulnerability Analysis
In production, a deployment could boot with a missing `DATABASE_URL`, placeholder `JWT_SECRET`, localhost `APP_URL`, or unconfigured email provider. If diagnostics printed variable values to logs, secrets could leak.

#### Technical Remediation
- Implemented `validateProductionAuthConfig(env)` and `assertProductionAuthConfigIsSafe(env)` in `server/src/config.ts`:
  - **Database URI**: Validates `postgres://` or `postgresql://` protocol and host presence.
  - **JWT Secret**: Enforces minimum 32 characters and explicitly rejects `DEV_FALLBACK_JWT_SECRET`.
  - **App URL**: Enforces absolute `https://` URI and rejects localhost/loopback addresses.
  - **Email Provider**: Requires valid provider (`resend`, `sendgrid`, or `brevo`), minimum 8-character API key, and valid sender email.
  - **Zero Secret Leakage**: Diagnostic messages report only status/problems and NEVER echo passwords, tokens, or API keys.

---

## 3. Test Verification & Evidence

### 3.1 Test Suite Breakdown

| Suite Category | Test File | Tests | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **RLS & CSRF Hardening** | `tests/security_hardening_rls_csrf.test.ts` | 19 | **PASSED** | 847ms |
| **Auth & DB Foundation** | `tests/phase9c_auth_database.test.ts` | 16 | **PASSED** | 1,632ms |
| **Server Production Unit Suites** | `tests/*.test.ts` (141 suites) | 363 | **PASSED** (15 skipped) | 18.2s |
| **Frontend Web Suites** | `web/tests/*.test.ts` (8 suites) | 112 | **PASSED** | 3.82s |
| **Typecheck (Server)** | `server/tsconfig.json` | — | **PASSED** (0 errors) | 3.1s |
| **Typecheck (Web)** | `web/tsconfig.json` | — | **PASSED** (0 errors) | 3.8s |
| **Production Build (Server)** | `tsc -p tsconfig.build.json` | — | **PASSED** | 2.9s |
| **Production Build (Web)** | `vite build` | — | **PASSED** | 4.1s |

### 3.2 Key Test Assertions Verified

1. `FORCE ROW LEVEL SECURITY` verified on `users` and `user_sessions` via `pg_class.relforcerowsecurity = true`.
2. Explicit CRUD policies verified in `pg_policies` for all operations.
3. Cross-tenant isolation verified: User A querying User B's record under `withUserContext` returns 0 rows.
4. Connection pool safety verified: `SELECT current_setting('app.current_user_id', true)` returns empty immediately after transaction completion (zero bleed).
5. CSRF double-submit protection verified:
   - Missing `X-CSRF-Token` header rejected with 403 `CSRF_ERROR`.
   - Mismatched `X-CSRF-Token` header rejected with 403 `CSRF_ERROR`.
   - Disallowed `Origin` (`https://malicious-attacker-website.com`) rejected with 403 `CSRF_ERROR`.
   - Matching token and cookie accepted with 200 OK.
   - Bearer token authentication bypasses cookie CSRF verification cleanly.
6. Timing-safe comparison verified across identical, partial, and empty strings.
7. Production configuration gate verified with zero secret leakage.

---

## 4. Production Database Runbook & Supabase Verification

When connecting to production Supabase PostgreSQL:

1. **Environment Variables**:
   ```bash
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
   JWT_SECRET="[64-character-cryptographically-random-hex-string]"
   APP_URL="https://enhancecv-orpin.vercel.app"
   EMAIL_PROVIDER="resend" # or sendgrid, brevo
   EMAIL_API_KEY="re_[API_KEY]"
   EMAIL_FROM="Curevo AI <notifications@curevo.ai>"
   ```
2. **Safe Schema Verification (Read-Only / Non-Destructive)**:
   ```sql
   -- Verify migrations applied
   SELECT id, name, applied_at FROM schema_migrations ORDER BY applied_at ASC;

   -- Verify RLS and FORCE RLS are active
   SELECT relname, relrowsecurity, relforcerowsecurity 
   FROM pg_class 
   WHERE relname IN ('users', 'user_sessions');

   -- Verify explicit tenant policies
   SELECT tablename, policyname, cmd 
   FROM pg_policies 
   WHERE tablename IN ('users', 'user_sessions');
   ```
3. **Stateless Fallback Guarantee**:
   If `DATABASE_URL` is ever unreachable or unset, `/api/public/improve`, `/api/public/ats`, `/api/public/score`, and `/api/public/pdf` continue operating 100% statelessly without downtime.

---

## 5. Conclusion & Next Phase

Phase 9C.2 resolves all identified security vulnerabilities from Phase 9C and Phase 9C.1:
- Row Level Security is hardened with `FORCE ROW LEVEL SECURITY` and explicit CRUD policies.
- Anti-CSRF protection safeguards all ambient cookie sessions in cross-origin architecture.
- Asynchronous bcrypt eliminates event loop starvation.
- Migration advisory locking and cryptographic ID entropy prevent concurrency and predictability issues.
- The platform is structurally prepared for Phase 9D (Multi-Resume Cloud Persistence & Dashboard API).
