# Curevo AI — Complete API & Service Inventory

**Repository:** `kirankumarJADA/enhancecv`  
**Backend Directory:** `server/src`  
**Routing Architecture:** Express 4 with monkey-patched async layer routing (`middleware/async.ts`).  
**Audit Scope:** 100% of all registered routes across all 17 route-defining source files. Every single endpoint has been verified with exact line numbers, middleware pipelines, and runtime operational statuses.

---

## 1. Executive Summary & Routing Topology

The Curevo AI backend architecture features a **dual-mode operational paradigm**:
1. **Active Public Mode (Stateless)**:
   - Root endpoints in `app.ts` (2) and public endpoints in `public.ts` (25).
   - **Total Active Stateless Endpoints:** **27**.
   - These endpoints process all requests in volatile RAM with zero remote database dependencies (`DATABASE_URL` is completely optional).
2. **Authenticated Mode (PostgreSQL Dependent)**:
   - Identity and cloud autosave endpoints mounted with CSRF & JWT protection: `auth.ts` (12), `profile.ts` (3), `master.ts` (10), `resumes.ts` (12).
   - **Total Mounted Stateful Endpoints:** **37**.
   - When `DATABASE_URL` or `ENABLE_DATABASE` is unset, database calls fail gracefully and return `503 AUTH_UNAVAILABLE` or `401 UNAUTHENTICATED`, never crashing the process.
3. **Unmounted Staged Routers (Future / Legacy)**:
   - Routers present in `server/src/routes/` but explicitly unmounted in `server/src/app.ts#L74-L80`: `admin.ts` (4), `ai.ts` (13), `applications.ts` (7), `billing.ts` (5), `dashboard.ts` (1), `discovery.ts` (7), `imports.ts` (4), `insights.ts` (2), `interview.ts` (7), `jobs.ts` (6), `templates.ts` (3).
   - **Total Unmounted Endpoints:** **59**.
   - Requests to these paths resolve safely to `404 NOT FOUND` via `notFoundHandler`.

**Grand Total System Endpoints Cataloged:** **113 Endpoints**.

---

## 2. Master Endpoint Inventory Table

### Group 1: Root System Endpoints (`server/src/app.ts`)

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | `app.ts:54` | Anonymous inline | None | `rateLimit(120/min)` | None | None | `200` JSON `{ ok, service, time }` | None | **MOUNTED & ACTIVE** |
| `GET` | `/api/ai/status` | `app.ts:59` | Anonymous inline | None | `rateLimit(120/min)` | `getAiStatus()` | None (env inspection) | `200` JSON `{ enabled, provider, model, maxIterations }` | None | **MOUNTED & ACTIVE** |

---

### Group 2: Public Stateless Engine (`server/src/routes/public.ts`)
*Mounted at `/api/public` in `app.ts:64`. Operates 100% in-memory with zero database dependencies.*

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/public/status` | `public.ts:67` | Anonymous inline | None | None | `getAiStatus()` | None | `200` JSON `{ enabled, provider, model, maxIterations }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/parse` | `public.ts:749` | Anonymous inline | Extension & MIME check, size <=8MB | `rateLimit(20/15m)`, `upload.single('file')` | `extractFile()`, `analyseATS()` | Isolated Node Worker (`pdfjs-dist` / `mammoth`) | `200` JSON `{ resume, ats, audit, confidence, notes }` | RAM buffer (Multer) | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/ats` | `public.ts:787` | Anonymous inline | `validateResume(req.body.resume)` | `rateLimit(60/15m)` | `analyseATS()` | None | `200` JSON `{ ats, audit }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/audit` | `public.ts:805` | Anonymous inline | `validateResume(req.body.resume)` | `rateLimit(60/15m)` | `analyseATS()` (9 ATS dimensions) | None | `200` JSON `{ audit, ats }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/match` | `public.ts:823` | Anonymous inline | `validateResume()`, `validateJobText()` | `rateLimit(60/15m)` | `analyseJobDescription()`, `computeJobMatch()` | None | `200` JSON `{ job, match }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/improve` | `public.ts:853` | Anonymous inline | `validateResume()`, `validateJobText()` | `rateLimit(10/15m)`, `aiConcurrencyGuard` | `analyseJobDescription()`, `analyseATS()`, `computeJobMatch()`, `runResumeAgent()` | NVIDIA Nemotron AI API | `200` JSON `{ resume, targetRole, changeLog, truth, atsBefore, atsAfter, matchBefore, matchAfter, agent }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/create` | `public.ts:912` | Anonymous inline | String bounds on experience, education, projects | `rateLimit(10/15m)`, `aiConcurrencyGuard` | `createResumeFromDetails()` | NVIDIA Nemotron AI API | `200` JSON `{ resume, ats, match, changeLog, truth, agent }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/pdf` | `public.ts:962` | Anonymous inline | `validateResume()`, template & `pageSize` validation | `rateLimit(30/15m)` | `renderResumePdf()`, `pdfFileName()` | PDFKit streaming | `200` Stream `application/pdf` | Memory Stream | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/cover-letter` | `public.ts:1021` | Anonymous inline | `validateResume()`, `validateJobText()` | `rateLimit(20/15m)`, `aiConcurrencyGuard` | `generateCoverLetter()`, `analyseJobDescription()`, `computeJobMatch()` | NVIDIA Nemotron AI API | `200` JSON `{ letter, targetRole, company, rejectedCount, warnings, provider, model, isFallback }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/cover-letter/pdf` | `public.ts:1104` | Anonymous inline | `validateCoverLetter()`, `pageSize` check | `rateLimit(30/15m)` | `renderCoverLetterPdf()`, `coverLetterFileName()` | PDFKit streaming | `200` Stream `application/pdf` | Memory Stream | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/jobs/status` | `public.ts:1148` | Anonymous inline | None | None | `getJobSourceProvider()`, `isJobSourceConfigured()` | External Jobs API (if configured) | `200` JSON `{ ok, configured, provider, message }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/jobs/discover` | `public.ts:1168` | Anonymous inline | Query, location, remoteType sanitize | `rateLimit(60/15m)` | `searchJobsWithCache()` or `CURATED_JOBS` filter | Adzuna UK / Reed UK / Presets | `200` JSON `{ ok, jobs, total, source, provider }` | Memory Cache (10m TTL) | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/interview/status` | `public.ts:1278` | Anonymous inline | None | None | `getAiStatus()`, `INTERVIEW_CATEGORIES` | None | `200` JSON `{ ok, ai, categories, framework }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/interview/prep` | `public.ts:1291` | Anonymous inline | `getSafeResume()`, `validateJobText()` | `rateLimit(60/15m)`, `aiConcurrencyGuard` | `generateInterviewPrep()`, `analyseJobDescription()` | NVIDIA Nemotron AI API | `200` JSON `{ ok, questions, studyPlan, meta }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/interview/star-coach` | `public.ts:1344` | Anonymous inline | STAR components length checks | `rateLimit(60/15m)`, `aiConcurrencyGuard` | `evaluateStarAnswer()` | NVIDIA Nemotron AI API | `200` JSON `{ ok, relevance, structure, improvements, overallFeedback }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/interview/mock-evaluate` | `public.ts:1405` | Anonymous inline | Question & answer length checks | `rateLimit(60/15m)`, `aiConcurrencyGuard` | `evaluateMockAnswer()` | NVIDIA Nemotron AI API | `200` JSON `{ ok, evaluation, next }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/interview/mock-final` | `public.ts:1465` | Anonymous inline | Transcript array validation (max 25 items) | `rateLimit(60/15m)`, `aiConcurrencyGuard` | `generateFinalMockReport()` | NVIDIA Nemotron AI API | `200` JSON `{ ok, overallScore, summary, categoryBreakdown, actionItems }` | Memory | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/linkedin/status` | `public.ts:1530` | Anonymous inline | None | None | `getAiStatus()` | None | `200` JSON `{ ok, ai, supportedHeadlineStyles, supportedSections }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/linkedin/optimize` | `public.ts:1549` | Anonymous inline | Section string checks, `RESUME_LIMITS` bounds | `rateLimit(60/15m)`, `aiConcurrencyGuard` | `optimizePublicLinkedin()` | NVIDIA Nemotron AI API | `200` JSON `{ ok, headline, about, experience, skills, recruiterKeywords, meta }` | Memory | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/company-research/status` | `public.ts:1631` | Anonymous inline | None | None | `isWebSearchConfigured()`, `resolveSearchProvider()` | Tavily / SerpAPI (if configured) | `200` JSON `{ ok, configured, provider, curatedBenchmarkAvailable }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/company-research` | `public.ts:1651` | Anonymous inline | Company name check, optional job text | `rateLimit(40/15m)`, `aiConcurrencyGuard` | `researchCompany()` | Web Search API / Nemotron AI / Benchmarks | `200` JSON `{ ok, research }` | Memory | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/email/status` | `public.ts:1689` | Anonymous inline | None | None | `isEmailConfigured()` | Brevo / Resend / SendGrid / Console | `200` JSON `{ ok, configured, provider, message }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/email/resume` | `public.ts:1715` | Anonymous inline | Zod: `emailResumeSchema` (consent: true) | `rateLimit(10/15m)` | `sendEmail()` | Brevo / Resend / SendGrid API | `200` JSON `{ ok, delivered, provider, message }` | Memory | **MOUNTED & ACTIVE** |
| `POST` | `/api/public/email/interview-report` | `public.ts:1777` | Anonymous inline | Zod: `emailInterviewReportSchema` (consent: true) | `rateLimit(10/15m)` | `sendEmail()` | Brevo / Resend / SendGrid API | `200` JSON `{ ok, delivered, provider, message }` | Memory | **MOUNTED & ACTIVE** |
| `GET` | `/api/public/billing/status` | `public.ts:1829` | Anonymous inline | None | None | Env check: `STRIPE_SECRET_KEY` | Stripe (boolean configured) | `200` JSON `{ ok, freeForever: true, publicCoreGuarantee, stripeConfigured }` | Memory | **MOUNTED & ACTIVE** |

---

### Group 3: Authentication & Identity Routes (`server/src/routes/auth.ts`)
*Mounted at `/api/auth` in `app.ts:67` with `csrfProtection`.*

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | `auth.ts:117` | Anonymous inline | Zod: `signupSchema` (name, email, password >=8) | `csrfProtection`, `rateLimit(20/15m)` | `bcrypt.hash()`, `createVerificationToken()`, `sendVerificationEmail()`, `startSession()`, `track()` | PostgreSQL, Email API | `201` JSON `{ user, csrfToken }` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `GET` | `/api/auth/csrf` | `auth.ts:160` | Anonymous inline | None | `csrfProtection` (vends cookie) | `ensureCsrfCookie()` | None | `200` JSON `{ csrfToken }` | Cookie / RAM | **MOUNTED & ACTIVE** (No DB needed) |
| `POST` | `/api/auth/login` | `auth.ts:165` | Anonymous inline | Zod: `loginSchema` (email, password) | `csrfProtection`, `rateLimit(30/15m, email\|ip)` | `bcrypt.compare()`, `startSession()`, `track()` | PostgreSQL | `200` JSON `{ user, csrfToken }` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `POST` | `/api/auth/logout` | `auth.ts:213` | Anonymous inline | None | `csrfProtection` | `sessionRefFromToken()`, `revokeSession()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; Clears cookies |
| `GET` | `/api/auth/me` | `auth.ts:238` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `getDb()`, `ensureCsrfCookie()` | PostgreSQL | `200` JSON `{ user, csrfToken }` | PostgreSQL | **MOUNTED**; 401 unauth / 503 if DB unset |
| `POST` | `/api/auth/resend-verification` | `auth.ts:281` | Anonymous inline | Zod: optional `email` | `csrfProtection`, `rateLimit(5/15m)` | `createVerificationToken()`, `sendVerificationEmail()` | PostgreSQL, Email API | `200` JSON `{ ok: true, emailConfigured }` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `GET` | `/api/auth/verify-email` | `auth.ts:300` | Anonymous inline | Query: `token` | `csrfProtection` | `consumeVerificationToken()`, `markEmailVerified()`, `track()` | PostgreSQL | `302` Redirect to `${appUrl}/login?verified=1` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `POST` | `/api/auth/forgot-password` | `auth.ts:316` | Anonymous inline | Zod: `email` schema | `csrfProtection`, `rateLimit(5/15m, email\|ip)` | `createPasswordResetToken()`, `sendResetEmail()` | PostgreSQL, Email API | `200` JSON `{ ok: true, emailConfigured, devActionUrl }` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `POST` | `/api/auth/reset-password` | `auth.ts:348` | Anonymous inline | Zod: `token` (>=10), `newPassword` (>=8) | `csrfProtection`, `rateLimit(10/15m)` | `consumePasswordResetToken()`, `bcrypt.hash()`, `revokeAllSessions()`, `withTransaction()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 503 if DB unset |
| `POST` | `/api/auth/extension-token` | `auth.ts:384` | Anonymous inline | Zod: optional `name` (<=60) | `csrfProtection`, `requireAuth`, `rateLimit(5/60s)` | `createExtensionToken()` (SHA-256 stored) | PostgreSQL | `201` JSON `{ token }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/auth/extension-tokens` | `auth.ts:390` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `listExtensionTokens()` | PostgreSQL | `200` JSON `{ tokens }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `DELETE` | `/api/auth/extension-tokens/:id` | `auth.ts:394` | Anonymous inline | `req.params.id` string | `csrfProtection`, `requireAuth` | `revokeExtensionToken()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |

---

### Group 4: Profile Management Routes (`server/src/routes/profile.ts`)
*Mounted at `/api/profile` in `app.ts:68` with `csrfProtection`.*

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/profile/` | `profile.ts:12` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `getDb()`, `TS_TEXT()` | PostgreSQL | `200` JSON `{ profile }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `PUT` | `/api/profile/` | `profile.ts:27` | Anonymous inline | Zod: `name` (1-80), `targetRole` (<=120) | `csrfProtection`, `requireAuth` | `getDb()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `PUT` | `/api/profile/password` | `profile.ts:37` | Anonymous inline | Zod: `currentPassword`, `newPassword` (>=8) | `csrfProtection`, `requireAuth` | `bcrypt.compare()`, `bcrypt.hash()`, `revokeAllSessions()`, `withTransaction()`, `startSession()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |

---

### Group 5: Master CV & Version History Routes (`server/src/routes/master.ts`)
*Mounted at `/api/master` in `app.ts:71` with `csrfProtection`.*

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/master/parse-upload` | `master.ts:179` | Anonymous inline | File presence & extension filter | `csrfProtection`, `requireAuth`, `rateLimit(10/60s)`, `upload.single('file')` | `extractFile()` | Node Worker thread | `200` JSON `{ resume, confidence, notes }` | RAM buffer (Multer) | **MOUNTED**; Requires Auth |
| `GET` | `/api/master/` | `master.ts:190` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.get()`, `computeCompleteness()` | PostgreSQL | `200` JSON `{ master }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `PUT` | `/api/master/` | `master.ts:213` | Anonymous inline | Zod: `resume` payload, optional revision | `csrfProtection`, `requireAuth`, `rateLimit(60/60s)` | `sanitizeResumeData()`, `analyseATS()`, `MasterCvRepository.save()`, `track()` | PostgreSQL | `200` / `201` JSON `{ id, revision, atsScore, completeness, version }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `DELETE` | `/api/master/` | `master.ts:256` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.delete()`, `track()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/master/import-draft` | `master.ts:266` | Anonymous inline | Zod: `draft` object, `overwrite` boolean | `csrfProtection`, `requireAuth`, `rateLimit(20/60s)` | `sanitizeResumeData()`, `analyseATS()`, `MasterCvRepository.save()`, `track()` | PostgreSQL | `200` JSON `{ ok: true, id, revision, atsScore, completeness, version }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/master/versions` | `master.ts:319` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.listVersions()` | PostgreSQL | `200` JSON `{ versions }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/master/versions` | `master.ts:325` | Anonymous inline | Zod: optional `label` (<=120) | `csrfProtection`, `requireAuth`, `rateLimit(30/60s)` | `MasterCvRepository.createSnapshot()`, `track()` | PostgreSQL | `201` JSON `{ version }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/master/versions/:versionId` | `master.ts:337` | Anonymous inline | `req.params.versionId` string | `csrfProtection`, `requireAuth` | `MasterCvRepository.getVersion()` | PostgreSQL | `200` JSON `{ version }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/master/versions/:versionId/restore` | `master.ts:346` | Anonymous inline | `req.params.versionId` string | `csrfProtection`, `requireAuth`, `rateLimit(20/60s)` | `MasterCvRepository.restoreVersion()`, `track()` | PostgreSQL | `200` JSON `{ master, version }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/master/ats` | `master.ts:369` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.get()`, `analyseATS()` | PostgreSQL | `200` JSON `{ analysis, completeness }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |

---

### Group 6: Resumes & Tailored Versions Routes (`server/src/routes/resumes.ts`)
*Mounted at `/api/resumes` in `app.ts:72` with `csrfProtection`.*

| Method | Endpoint Path | Source & Line | Handler | Request Validation | Applied Middleware | Services & Engines | External Dependencies | Response Structure | Storage | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/resumes/` | `resumes.ts:68` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.get()`, `listTailoredResumes()` | PostgreSQL | `200` JSON `{ resumes, master, tailored }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/resumes/tailored` | `resumes.ts:144` | Anonymous inline | None | `csrfProtection`, `requireAuth` | `MasterCvRepository.listTailoredResumes()` | PostgreSQL | `200` JSON `{ resumes }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/resumes/tailored` | `resumes.ts:150` | Anonymous inline | Zod: `title` (1-160), `resume` payload | `csrfProtection`, `requireAuth`, `rateLimit(30/60s)` | `sanitizeResumeData()`, `analyseATS()`, `saveTailoredResume()` | PostgreSQL | `200` / `201` JSON `{ ok: true, resume }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/resumes/tailored/:id` | `resumes.ts:189` | Anonymous inline | `req.params.id` string | `csrfProtection`, `requireAuth` | `MasterCvRepository.getTailoredResume()` | PostgreSQL | `200` JSON `{ resume }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `DELETE` | `/api/resumes/tailored/:id` | `resumes.ts:196` | Anonymous inline | `req.params.id` string | `csrfProtection`, `requireAuth` | `MasterCvRepository.deleteTailoredResume()` | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/resumes/tailored/:id/pdf` | `resumes.ts:220` | `handleTailoredPdf` | Template validation | `csrfProtection`, `requireAuth`, `rateLimit(30/60s)` | `renderResumePdf()`, `track()` | PDFKit | `200` Stream `application/pdf` | Memory Stream | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/resumes/tailored/:id/pdf` | `resumes.ts:221` | `handleTailoredPdf` | Template validation | `csrfProtection`, `requireAuth`, `rateLimit(30/60s)` | `renderResumePdf()`, `track()` | PDFKit | `200` Stream `application/pdf` | Memory Stream | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/resumes/:id` | `resumes.ts:227` | Anonymous inline | `req.params.id` string | `csrfProtection`, `requireAuth` | Master vs tailored vs legacy `resumes` | PostgreSQL | `200` JSON `{ resume }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `PUT` | `/api/resumes/:id` | `resumes.ts:289` | Anonymous inline | Zod: `resume` payload | `csrfProtection`, `requireAuth`, `rateLimit(60/60s)` | `sanitizeResumeData()`, `analyseATS()` | PostgreSQL | `200` JSON `{ id, atsScore, title }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `POST` | `/api/resumes/:id/duplicate` | `resumes.ts:338` | Anonymous inline | Zod: optional `title` | `csrfProtection`, `requireAuth` | `saveTailoredResume()` / legacy `resumes` | PostgreSQL | `201` JSON `{ id }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `DELETE` | `/api/resumes/:id` | `resumes.ts:371` | Anonymous inline | `req.params.id` string | `csrfProtection`, `requireAuth` | Ownership check; forbids deleting master | PostgreSQL | `200` JSON `{ ok: true }` | PostgreSQL | **MOUNTED**; 401/503 if DB unset |
| `GET` | `/api/resumes/:id/pdf` | `resumes.ts:390` | Anonymous inline | Template validation | `csrfProtection`, `requireAuth`, `rateLimit(30/60s)` | `renderResumePdf()`, `pdfFileName()` | PDFKit | `200` Stream `application/pdf` | Memory Stream | **MOUNTED**; 401/503 if DB unset |

---

### Group 7: Unmounted Routers (Staged / Legacy)
*Explicitly unmounted in `server/src/app.ts#L74-L80`. Resolve safely to 404 without database connection attempts.*

#### Router: `server/src/routes/admin.ts` (4 Endpoints)
*Middleware: `router.use(requireAuth, requireAdmin)` (admin.ts:11)*
- `GET /api/admin/stats` (`admin.ts:13`): Aggregates SQL `COUNT(*)` across 13 tables. **UNMOUNTED (404)**.
- `GET /api/admin/users` (`admin.ts:62`): Paginated user listing with subscription info. **UNMOUNTED (404)**.
- `GET /api/admin/usage` (`admin.ts:83`): Aggregated monthly feature usage. **UNMOUNTED (404)**.
- `GET /api/admin/errors` (`admin.ts:103`): Paginated error event log. **UNMOUNTED (404)**.

#### Router: `server/src/routes/ai.ts` (13 Endpoints)
*Stateful AI tool endpoints with quota management.*
- `GET /api/ai/status` (`ai.ts:31`): Internal status check. **UNMOUNTED** (Aliased publicly at `app.ts:59`).
- `GET /api/ai/usage` (`ai.ts:36`): Feature usage quotas. **UNMOUNTED (404)**.
- `POST /api/ai/critique` (`ai.ts:78`): Generates LLM critique of a saved resume. **UNMOUNTED (404)**.
- `POST /api/ai/cover-letter` (`ai.ts:149`): Generates & stores cover letter for user. **UNMOUNTED (404)**.
- `GET /api/ai/cover-letters` (`ai.ts:188`): Lists user's stored cover letters. **UNMOUNTED (404)**.
- `PUT /api/ai/cover-letters/:id` (`ai.ts:209`): Updates stored cover letter. **UNMOUNTED (404)**.
- `DELETE /api/ai/cover-letters/:id` (`ai.ts:229`): Deletes stored cover letter. **UNMOUNTED (404)**.
- `GET /api/ai/cover-letters/:id/download` (`ai.ts:240`): Downloads stored letter as PDF. **UNMOUNTED (404)**.
- `POST /api/ai/linkedin` (`ai.ts:256`): Generates & stores LinkedIn headlines. **UNMOUNTED (404)**.
- `POST /api/ai/grammar` (`ai.ts:295`): Suggests grammar corrections. **UNMOUNTED (404)**.
- `POST /api/ai/translate` (`ai.ts:328`): Translates CV to target language/market. **UNMOUNTED (404)**.
- `POST /api/ai/company-research` (`ai.ts:365`): Researches company and stores in DB. **UNMOUNTED (404)**.
- `GET /api/ai/company-research` (`ai.ts:391`): Lists stored company research. **UNMOUNTED (404)**.

#### Router: `server/src/routes/applications.ts` (7 Endpoints)
*Database-backed Kanban tracking pipeline.*
- `GET /api/applications/` (`applications.ts:67`): Lists user's tracked applications. **UNMOUNTED (404)**.
- `POST /api/applications/` (`applications.ts:94`): Creates new application record. **UNMOUNTED (404)**.
- `GET /api/applications/:id` (`applications.ts:126`): Gets application details. **UNMOUNTED (404)**.
- `PATCH /api/applications/:id` (`applications.ts:131`): Updates status and logs event. **UNMOUNTED (404)**.
- `GET /api/applications/:id/events` (`applications.ts:168`): Timeline audit trail. **UNMOUNTED (404)**.
- `POST /api/applications/from-job` (`applications.ts:190`): Creates application from saved job. **UNMOUNTED (404)**.
- `DELETE /api/applications/:id` (`applications.ts:219`): Deletes application. **UNMOUNTED (404)**.

#### Router: `server/src/routes/billing.ts` (5 Endpoints)
*Stripe subscription management.*
- `GET /api/billing/plans` (`billing.ts:18`): Returns plan tiers (Free vs Pro). **UNMOUNTED (404)**.
- `GET /api/billing/subscription` (`billing.ts:24`): Current subscription status. **UNMOUNTED (404)**.
- `POST /api/billing/checkout` (`billing.ts:34`): Creates Stripe checkout session. **UNMOUNTED (404)**.
- `POST /api/billing/portal` (`billing.ts:51`): Customer portal session. **UNMOUNTED (404)**.
- `POST /api/billing/webhook` (`billing.ts:63`): Stripe webhook listener. **UNMOUNTED (404)**.

#### Router: `server/src/routes/dashboard.ts` (1 Endpoint)
- `GET /api/dashboard/` (`dashboard.ts:12`): User metrics aggregation. **UNMOUNTED (404)**.

#### Router: `server/src/routes/discovery.ts` (7 Endpoints)
*Stateful job search and bookmarking.*
- `GET /api/discovery/status` (`discovery.ts:21`): Provider configuration check. **UNMOUNTED (404)**.
- `POST /api/discovery/search` (`discovery.ts:40`): Queries live job sources with plan quota. **UNMOUNTED (404)**.
- `POST /api/discovery/save` (`discovery.ts:80`): Saves job to database. **UNMOUNTED (404)**.
- `GET /api/discovery/saved` (`discovery.ts:114`): Lists saved jobs with pagination. **UNMOUNTED (404)**.
- `DELETE /api/discovery/saved/:id` (`discovery.ts:143`): Deletes saved job. **UNMOUNTED (404)**.
- `POST /api/discovery/saved/:id/apply` (`discovery.ts:153`): Converts job to application. **UNMOUNTED (404)**.
- `POST /api/discovery/saved/:id/match` (`discovery.ts:178`): Matches saved job with Master CV. **UNMOUNTED (404)**.

#### Router: `server/src/routes/imports.ts` (4 Endpoints)
*External resume importing.*
- `POST /api/imports/linkedin` (`imports.ts:22`): Parses LinkedIn PDF export. **UNMOUNTED (404)**.
- `POST /api/imports/json` (`imports.ts:77`): Imports JSON Resume schema. **UNMOUNTED (404)**.
- `POST /api/imports/text` (`imports.ts:98`): Ingests plain text CV. **UNMOUNTED (404)**.
- `POST /api/imports/url` (`imports.ts:118`): Ingests public portfolio URL. **UNMOUNTED (404)**.

#### Router: `server/src/routes/insights.ts` (2 Endpoints)
- `GET /api/insights/market` (`insights.ts:18`): Salary and skill demand trends. **UNMOUNTED (404)**.
- `GET /api/insights/skills` (`insights.ts:41`): Career skill gap analysis. **UNMOUNTED (404)**.

#### Router: `server/src/routes/interview.ts` (7 Endpoints)
*Database-persisted interview sessions.*
- `POST /api/interview/prepare` (`interview.ts:101`): Generates prep pack & saves to DB. **UNMOUNTED (404)**.
- `POST /api/interview/session` (`interview.ts:162`): Starts mock session in DB. **UNMOUNTED (404)**.
- `POST /api/interview/session/:id/answer` (`interview.ts:237`): Records candidate answer. **UNMOUNTED (404)**.
- `POST /api/interview/session/:id/finish` (`interview.ts:292`): Completes session. **UNMOUNTED (404)**.
- `GET /api/interview/history` (`interview.ts:327`): Lists user's past sessions. **UNMOUNTED (404)**.
- `GET /api/interview/session/:id` (`interview.ts:345`): Full transcript & feedback. **UNMOUNTED (404)**.
- `POST /api/interview/session/:id/pause` (`interview.ts:365`): Pauses/resumes session. **UNMOUNTED (404)**.

#### Router: `server/src/routes/jobs.ts` (6 Endpoints)
*Job description management & tailoring.*
- `GET /api/jobs/example` (`jobs.ts:52`): Returns static Senior Java Engineer example JD. **UNMOUNTED (404)**.
- `GET /api/jobs/` (`jobs.ts:57`): Lists user's stored job descriptions. **UNMOUNTED (404)**.
- `POST /api/jobs/analyse` (`jobs.ts:92`): Ingests JD text and stores structured analysis. **UNMOUNTED (404)**.
- `GET /api/jobs/:id` (`jobs.ts:132`): Retrieves stored job analysis. **UNMOUNTED (404)**.
- `POST /api/jobs/:id/match` (`jobs.ts:164`): Matches stored JD with Master CV. **UNMOUNTED (404)**.
- `POST /api/jobs/:id/tailor` (`jobs.ts:192`): Full tailoring pipeline run against Master CV. **UNMOUNTED (404)**.

#### Router: `server/src/routes/templates.ts` (3 Endpoints)
- `GET /api/templates/` (`templates.ts:19`): Lists available templates. **UNMOUNTED (404)**.
- `PUT /api/templates/select` (`templates.ts:27`): Updates user's default template. **UNMOUNTED (404)**.
- `GET /api/templates/recommendation` (`templates.ts:41`): Deterministic template recommendation. **UNMOUNTED (404)**.
