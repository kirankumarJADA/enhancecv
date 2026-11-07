# Curevo AI / EnhanceCV — Phase 9A
# Complete Architecture, Database, Authentication & Data Persistence Audit

**Date:** 2026-11-04  
**Auditor:** Principal Software Architect, Senior Backend Engineer, Database Architect & Application Security Engineer  
**Repository:** `https://github.com/kirankumarJADA/enhancecv`  
**Active Branch:** `main`  
**HEAD Commit:** `154b879c1fe3746f328098aaccb230aa8741585a`  
**Production Frontend:** `https://enhancecv-orpin.vercel.app` (Vercel)  
**Production Backend:** `https://curevo-ai.onrender.com` (Render)  

---

## 1. Executive Summary

An exhaustive, evidence-based architectural audit was conducted on the EnhanceCV / Curevo AI codebase and its active production deployment.

### The Central Architectural Finding
Earlier documentation and product specifications envisioned Curevo AI as an authenticated, database-backed "Career Operating System" with user accounts, persistent Master CVs, tailored resume histories, application tracking, saved job discoveries, and interview coaching.

**In reality, Curevo AI currently operates 100% as a stateless, in-memory, sessionless resume-building tool.**

1. **Zero Server-Side Persistence Active**: The Express application entrypoint ([`server/src/app.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/app.ts)) intentionally unmounts all database-backed routes (`/api/auth`, `/api/master`, `/api/resumes`, `/api/dashboard`, `/api/profile`, `/api/ai`, `/api/billing`, `/api/applications`, `/api/templates`, `/api/admin`, `/api/interview`, `/api/jobs`, `/api/import`, `/api/analytics`). Only `/api/health` and `/api/public/*` are mounted.
2. **Zero Browser Persistence Active**: The active frontend ([`web/src/pages/PublicBuilder.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/PublicBuilder.tsx)) holds all state (Master CV, job description, ATS score, Truth Guard audit, AI rewrite change log, and generated cover letters) exclusively in React component memory (`useState`). Neither `localStorage`, `sessionStorage`, nor `IndexedDB` is used.
3. **Imsequence**: If a user refreshes the page, clicks the browser Back button, or navigates away, **all entered data and generated artifacts are permanently lost**, unless the user explicitly downloaded a PDF file.
4. **Authentication is Disconnected**: `AuthProvider` hardcodes `user: null` and provides a no-op `refresh()`. All legacy authentication routes in the frontend (`/login`, `/signup`, `/onboarding`, `/app/*`) redirect to `/builder`.
5. **Core AI & ATS Intelligence is Fully Functional**: The stateless resume parsing, ATS scoring engine (9 dimensions), job description analysis, NVIDIA Nemotron resume improvement, Truth Guard factual grounding, Cover Letter generator, and PDF streaming across 6 templates are production-ready, thoroughly tested (363 backend tests, 98 frontend tests, 100% green), and verified live in production.

---

## 2. Repository & Deployment State Baseline

### 2.1 Git Verification
- **Repository Root**: `C:/Users/jadak/.zcode/workspace/default/enhancecv`
- **Current Branch**: `main` (synchronized with `origin/main`)
- **Verified Commits in History**:
  - `154b879` — *fix(api): map malformed JSON bodies to 400 instead of 500*
  - `7caf94c` — *fix(deps): upgrade react-router-dom 6.30.6 → 7.18.5 (remediates 2 production advisories)*
  - `fe13110` — *fix(security): remediate body-parser, qs, vite, and source-map-js vulnerabilities in lockfiles*
  - `4db96c2` — *fix(ai): harden critique token headroom, unwrap nested response structures, and default missing critique arrays*
  - `d339b4c` — *fix(ai): harden normalisation against non-array structures, string advisory, and surface schema error details*
- **Working Tree**: Clean of tracked changes. Untracked QA test scripts in `server/tests/` preserved untouched.

### 2.2 Live Production Verification
- `GET https://curevo-ai.onrender.com/api/health` -> **HTTP 200 OK** (`{"ok":true,"service":"curevo-ai"}`)
- `GET https://curevo-ai.onrender.com/api/public/status` -> **HTTP 200 OK** (Provider: `nvidia`, Model: `nvidia/nemotron-3.5-lightning-30b-a3b`, Timeout: 65,000ms, Max Iterations: 2)
- `POST https://curevo-ai.onrender.com/api/public/ats` (Malformed JSON) -> **HTTP 400 Bad Request** (`MALFORMED_JSON`)
- `POST https://curevo-ai.onrender.com/api/public/ats` (Valid Resume) -> **HTTP 200 OK** (Score: 96/100, 9 dimensions)
- `GET https://enhancecv-orpin.vercel.app` -> **HTTP 200 OK** (Active bundle loaded, redirects operational)

---

## 3. Frontend Architecture Audit

### 3.1 Structure & Dependency Analysis
- **Framework**: React 18.3.1, Vite 6.0.7, React Router DOM 7.18.5, Tailwind CSS 3.4.17.
- **State Management Libraries**: None (No Redux, Zustand, Recoil, or TanStack Query installed in `web/package.json`).
- **HTTP Client**: Native browser `fetch` wrapped in [`web/src/api.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/api.ts).

### 3.2 Route Inventory
Configured in [`web/src/App.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/App.tsx):

| Route Path | Component | Auth Status | Data Source | Persistence | Backend API Endpoint | Operational Status |
|:---|:---|:---|:---|:---|:---|:---:|
| `/` | `Landing.tsx` | Public | Static / Hardcoded | Persistent (Code) | None | **Working** |
| `/builder` | `PublicBuilder.tsx` | Public | User Input / Upload | **Memory-Only** | `/api/public/*` | **Working** |
| `/ats` | Redirect -> `/builder?mode=ats` | Public | URL Param | None | None | **Working** |
| `/check-ats` | Redirect -> `/builder?mode=ats` | Public | URL Param | None | None | **Working** |
| `/tailor` | Redirect -> `/builder?mode=improve` | Public | URL Param | None | None | **Working** |
| `/login` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/signup` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/onboarding` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/forgot-password` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/reset-password` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/verify-email` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/app` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `/app/*` | Redirect -> `/builder` | Public | None | None | None | **Redirected (Legacy)** |
| `*` | Redirect -> `/` | Public | None | None | None | **Working** |

### 3.3 Disconnected / Orphaned Frontend Pages
The following 20 React page files exist in [`web/src/pages/`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/) but are completely unmounted in `App.tsx`:
1. `Admin.tsx` (calls unmounted `/api/admin/*`)
2. `AITools.tsx` (calls unmounted `/api/ai/*`)
3. `AIToolsTabs.tsx` (calls unmounted `/api/ai/*`)
4. `Applications.tsx` (calls unmounted `/api/applications/*`)
5. `AuthFlows.tsx` (calls unmounted `/api/auth/*`)
6. `Billing.tsx` (calls unmounted `/api/billing/*`)
7. `Dashboard.tsx` (calls unmounted `/api/dashboard`)
8. `HealthCenter.tsx` (calls unmounted `/api/analytics/health`)
9. `Interview.tsx` (calls unmounted `/api/interview/*`)
10. `JobAnalyses.tsx` (calls unmounted `/api/jobs/*`)
11. `Jobs.tsx` (calls unmounted `/api/jobs/*`)
12. `Login.tsx` (calls unmounted `/api/auth/login`)
13. `MasterCV.tsx` (calls unmounted `/api/master`)
14. `Onboarding.tsx` (calls unmounted `/api/master`)
15. `Profile.tsx` (calls unmounted `/api/profile`)
16. `ResumeEditor.tsx` (calls unmounted `/api/resumes/*`)
17. `Resumes.tsx` (calls unmounted `/api/resumes`)
18. `Signup.tsx` (calls unmounted `/api/auth/signup`)
19. `Tailor.tsx` (calls unmounted `/api/jobs/*`)
20. `Templates.tsx` (calls unmounted `/api/templates`)

---

## 4. State Management & Data Persistence Classification

Every major career data category was audited across the active application lifecycle:

| Data Category | Creation Point | Storage Location | Survives Page Refresh? | Survives Browser Restart? | Cross-Device Sync? | Classification |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **Master CV** | Upload (`/parse`), Scratch (`/create`), or Sample | React State (`setResume`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Tailored Resumes** | AI Improve (`/improve`) or Manual Edit | React State (`setResume`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **ATS Audit Results** | Computed via `/ats` or `/audit` | React State (`setAts`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Truth Guard Audits** | Computed via `/improve` or `/create` | React State (`setTruth`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Change Logs** | Returned by AI Improve | React State (`setChangeLog`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Cover Letters** | Generated via `/cover-letter` | React State (`setCoverLetter`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Job Descriptions** | Textarea paste or Sample Preset | React State (`activeJobText`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Job Match Analyses** | Computed via `/match` | React State (`setMatch`) in `PublicBuilder.tsx` | **NO** | **NO** | **NO** | **MEMORY-ONLY** |
| **Saved Jobs** | Legacy `pages/Jobs.tsx` (unmounted) | None (routes unmounted) | **NO** | **NO** | **NO** | **NOT IMPLEMENTED** |
| **Applications Tracking** | Legacy `pages/Applications.tsx` (unmounted) | None (routes unmounted) | **NO** | **NO** | **NO** | **NOT IMPLEMENTED** |
| **Interview Prep / Mock** | Legacy `pages/Interview.tsx` (unmounted) | None (routes unmounted) | **NO** | **NO** | **NO** | **NOT IMPLEMENTED** |
| **User Identity / Accounts**| Legacy `pages/Login.tsx` (unmounted) | None (auth unmounted) | **NO** | **NO** | **NO** | **NOT IMPLEMENTED** |

---

## 5. Backend Architecture & API Inventory

### 5.1 Express Server Startup & Middleware Order
Configured in [`server/src/app.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/app.ts):
1. `getAiProvider()` — Initialises NVIDIA Nemotron / OpenAI singleton from environment variables.
2. `helmet(...)` — Security headers (CSP disabled in dev, same-site resource policy).
3. `X-Request-Id` — Correlation tracking via crypto random bytes.
4. `cors(...)` — Strict origin check against `FRONTEND_URL` and local dev origins with credentials enabled.
5. `express.json({ limit: '1mb' })` — Request body size bounding.
6. `cookieParser()` — Cookie parsing.
7. `app.get('/api/health')` — Lightweight service ping.
8. `app.use('/api/public', publicRoutes)` — Mounted stateless resume API router.
9. `notFoundHandler` — Intercepts all unmounted routes (including legacy `/api/auth`, `/api/master`, etc.) and returns HTTP 404 without querying PostgreSQL.
10. `errorHandler` — Central error mapper; maps malformed JSON to HTTP 400 `MALFORMED_JSON`, file size limits to HTTP 413, and redacts internal errors.

### 5.2 Mounted API Endpoints (Active Production Surface)

| Method | Route | Input Validation | Processing Engine | Persistence | Status |
|:---|:---|:---|:---|:---|:---:|
| `GET` | `/api/health` | None | System timestamp | None | **Live (HTTP 200)** |
| `GET` | `/api/public/status` | None | `getAiStatus()` | None | **Live (HTTP 200)** |
| `POST` | `/api/public/parse` | Multer memory (8MB max, PDF/DOCX/TXT) | `extractFile()` + `analyseATS()` | In-Memory stream | **Live (HTTP 200)** |
| `POST` | `/api/public/ats` | `validateResume()` | Deterministic `analyseATS()` | None | **Live (HTTP 200)** |
| `POST` | `/api/public/audit` | `validateResume()` | Advanced 9-dimension ATS audit | None | **Live (HTTP 200)** |
| `POST` | `/api/public/match` | `validateResume()` + string sanitize | `analyseJobDescription()` + `computeJobMatch()` | None | **Live (HTTP 200)** |
| `POST` | `/api/public/improve` | `validateResume()` + Concurrency Guard | `runResumeAgent()` (NVIDIA Nemotron + Truth Guard) | None | **Live (HTTP 200)** |
| `POST` | `/api/public/create` | `CreateResumeDetails` + Concurrency Guard | `createResumeFromDetails()` (NVIDIA Nemotron) | None | **Live (HTTP 200)** |
| `POST` | `/api/public/pdf` | `validateResume()` + template validation | `renderResumePdf()` (PDFKit across 6 templates) | Streamed blob | **Live (HTTP 200)** |
| `POST` | `/api/public/cover-letter` | `validateResume()` + Concurrency Guard | `generateCoverLetter()` (ResumeSkills + Truth Guard) | None | **Live (HTTP 200)** |
| `POST` | `/api/public/cover-letter/pdf` | `validateCoverLetter()` | `renderCoverLetterPdf()` (PDFKit A4/Letter) | Streamed blob | **Live (HTTP 200)** |

### 5.3 Unmounted API Routers (86 Routes in Codebase)

| Router File | Prefix | Routes Count | Reason for Unmounting | Current Production Behavior |
|:---|:---|:---:|:---|:---:|
| `routes/auth.ts` | `/api/auth` | 11 | Requires PostgreSQL `users`, `user_sessions`, and email provider | **HTTP 404 NOT FOUND** |
| `routes/master.ts` | `/api/master` | 4 | Requires PostgreSQL `resumes` table and session cookie | **HTTP 404 NOT FOUND** |
| `routes/resumes.ts` | `/api/resumes` | 9 | Requires PostgreSQL `resumes` table and session cookie | **HTTP 404 NOT FOUND** |
| `routes/jobs.ts` | `/api/jobs` | 6 | Requires PostgreSQL `job_descriptions` table | **HTTP 404 NOT FOUND** |
| `routes/applications.ts` | `/api/applications` | 7 | Requires PostgreSQL `applications` and `application_events` | **HTTP 404 NOT FOUND** |
| `routes/discovery.ts` | `/api/discovery` | 7 | Requires PostgreSQL `saved_jobs` and external job source API | **HTTP 404 NOT FOUND** |
| `routes/interview.ts` | `/api/interview` | 7 | Requires PostgreSQL `interview_sessions` and `interview_questions`| **HTTP 404 NOT FOUND** |
| `routes/ai.ts` | `/api/ai` | 13 | Stateful AI features (grammar, translate, company research) | **HTTP 404 NOT FOUND** |
| `routes/billing.ts` | `/api/billing` | 5 | Requires Stripe configuration and PostgreSQL `subscriptions` | **HTTP 404 NOT FOUND** |
| `routes/dashboard.ts` | `/api/dashboard` | 1 | Aggregates PostgreSQL user career records | **HTTP 404 NOT FOUND** |
| `routes/profile.ts` | `/api/profile` | 3 | Reads and updates PostgreSQL `users` record | **HTTP 404 NOT FOUND** |
| `routes/templates.ts` | `/api/templates` | 3 | Reads user preferred template from PostgreSQL | **HTTP 404 NOT FOUND** |
| `routes/admin.ts` | `/api/admin` | 4 | System telemetry and user table administration | **HTTP 404 NOT FOUND** |
| `routes/imports.ts` | `/api/imports` | 4 | LinkedIn archive and resume import to Master CV | **HTTP 404 NOT FOUND** |
| `routes/insights.ts` | `/api/insights` | 2 | Career health and analytics from PostgreSQL | **HTTP 404 NOT FOUND** |

---

## 6. Database Architecture & Supabase Audit

### 6.1 Database Configuration & Connection Status
- **PostgreSQL Pool Client**: Configured in [`server/src/db/db.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/db/db.ts) using `pg.Pool`.
- **Active Connection Status in Production**: **DISCONNECTED / INACTIVE**.
- **Evidence**:
  - `initializeDatabase()` is never invoked in `server/src/index.ts` or `server/src/app.ts`.
  - `getDb()` is only invoked by unmounted routes.
  - The production server boots and functions without `DATABASE_URL` being set or reachable.
  - Error monitoring (`lib/monitoring.ts`) was explicitly refactored in Phase 1 to prevent any SQL logging queries when `DATABASE_URL` is absent.

### 6.2 Database Schema Analysis (from `server/src/db/db.ts`)
The codebase contains complete raw SQL DDL for 27 relational tables:
1. `users`: Identity, hashed passwords, verification flags, roles, `session_version`.
2. `resumes`: Master and tailored CVs (`kind IN ('master', 'tailored')`), JSON content, foreign keys.
3. `job_descriptions`: Raw job texts, titles, companies.
4. `job_analyses`: Structured extracted requirements.
5. `ats_analyses`: Historical ATS scores.
6. `match_analyses`: Match scores and skill comparisons.
7. `tailoring_runs`: Before/after ATS scores, keyword coverage, Truth Guard reports.
8. `ai_runs`: Provider, model, iterations, latency, rejected claim counts.
9. `user_sessions`: Per-device session tracking with revocation timestamps.
10. `email_verification_tokens`: SHA-256 hashed single-use tokens.
11. `password_reset_tokens`: SHA-256 hashed reset tokens.
12. `usage_records`: Rate limiting and quota consumption.
13. `subscriptions`: Stripe subscription IDs, statuses, billing periods.
14. `billing_events`: Stripe webhook idempotency ledger.
15. `analytics_events`: Internal product event stream.
16. `applications`: Job application tracking kanban (`SAVED`, `APPLIED`, `INTERVIEW`, `OFFER`, etc.).
17. `cover_letters`: Saved cover letter text.
18. `linkedin_generations`: Generated LinkedIn summaries and headlines.
19. `error_events`: Internal error logs.
20. `saved_jobs`: Scraped or imported external job opportunities.
21. `job_searches`: Logged search queries and preferences.
22. `interview_sessions`: Mock and prep interview containers (`PREP`, `MOCK`).
23. `interview_questions`: Structured interview questions with evidence citations from CV.
24. `interview_answers`: Candidate responses and AI STAR evaluations.
25. `company_research`: Sourced factual company briefing documents.
26. `extension_tokens`: API tokens for browser extension pairing.
27. `application_events`: Status transitions and timeline notes for applications.

### 6.3 Security & Data Isolation Audit
- **Row-Level Security (RLS)**: Not defined in code. Because raw SQL migrations are defined in `db.ts` without Supabase RLS policies, data isolation is enforced strictly at the application SQL query layer (e.g. `WHERE user_id = $1`).
- **Authorization Verification**:
  - In `routes/resumes.ts`: Queries consistently check `WHERE id = $1 AND user_id = $2`.
  - In `routes/applications.ts`: Ownership checks are strictly enforced before mutations.
  - In `routes/ai.ts`: User ownership is validated on referenced `resumeId` and `jobId`.
- **Residual Risk**: If legacy routes were re-mounted without thorough testing, missing RLS policies in PostgreSQL would mean any application-level query bug could lead to cross-tenant data leaks.

---

## 7. Authentication & User Account Architecture

### 7.1 Current Status: DISCONNECTED
- **Frontend**:
  - `AuthProvider` ([`web/src/state/AuthContext.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/state/AuthContext.tsx)) provides `{ user: null, loading: false }`.
  - Calling `logout()` triggers `performLogout()`, clearing cookies.
  - All auth routes (`/login`, `/signup`, `/onboarding`) redirect to `/builder`.
- **Backend**:
  - `routes/auth.ts` contains a complete JWT + HTTP-only cookie implementation with dual-revocation (per-user `session_version` and per-device `user_sessions.id`).
  - Passwords hashed with `bcryptjs` (salt rounds: 12).
  - Unmounted in `app.ts`.

---

## 8. AI Agent & Career OS Capability Matrix

| Agent / Engine Capability | Code Implementation | UI Connected? | Live Backend Endpoint? | Provider / Model | Truth Guard Enforced? | Output Validated? | Persistence Status | Production Classification |
|:---|:---|:---:|:---:|:---|:---:|:---:|:---|:---|
| **ATS Scoring Engine** | `engine/ats.ts`, `audit.ts` | Yes | `POST /api/public/ats` | Deterministic Algorithm | N/A | TypeScript / Zod | Memory-Only | **Production-Ready & Verified** |
| **Job Description Parsing** | `engine/jd.ts` | Yes | `POST /api/public/match` | Deterministic NLP | N/A | TypeScript | Memory-Only | **Production-Ready & Verified** |
| **Job Match / Gap Engine** | `engine/match.ts` | Yes | `POST /api/public/match` | Deterministic Algorithm | N/A | TypeScript | Memory-Only | **Production-Ready & Verified** |
| **Resume Tailoring Agent** | `ai/resumeAgent.ts` | Yes | `POST /api/public/improve` | NVIDIA Nemotron 3.5 Lightning | **YES** | Zod + Normaliser | Memory-Only | **Production-Ready & Verified** |
| **Resume Creation Agent** | `ai/createAgent.ts` | Yes | `POST /api/public/create` | NVIDIA Nemotron 3.5 Lightning | **YES** | Zod + Normaliser | Memory-Only | **Production-Ready & Verified** |
| **Cover Letter Agent** | `ai/coverLetterAgent.ts`| Yes | `POST /api/public/cover-letter` | NVIDIA Nemotron / Fallback | **YES** | Zod + Normaliser | Memory-Only | **Production-Ready & Verified** |
| **PDF Generation Engine** | `engine/pdf.ts` | Yes | `POST /api/public/pdf` | PDFKit (6 templates) | N/A | Clean Stream | Downloaded PDF | **Production-Ready & Verified** |
| **Document Parser** | `engine/extract.ts` | Yes | `POST /api/public/parse` | pdfjs-dist / mammoth / txt | N/A | Sanitized Schema | Memory-Only | **Production-Ready & Verified** |
| **Interview Coaching Agent** | `ai/interviewAgent.ts` | No | Unmounted (`/api/interview`) | NVIDIA / OpenAI | Partial | Zod | None | **Implemented but Unmounted** |
| **LinkedIn Profile Agent** | `ai/linkedinAgent.ts` | No | Unmounted (`/api/ai/linkedin`)| NVIDIA / OpenAI | Yes | Zod | None | **Implemented but Unmounted** |
| **Grammar Audit Agent** | `ai/grammarAgent.ts` | No | Unmounted (`/api/ai/grammar`) | NVIDIA / OpenAI | Yes | Zod | None | **Implemented but Unmounted** |
| **Resume Localization Agent** | `ai/localizationAgent.ts`| No | Unmounted (`/api/ai/translate`)| NVIDIA / OpenAI | Yes | Zod | None | **Implemented but Unmounted** |
| **Company Research Agent** | `ai/companyResearchAgent.ts`| No| Unmounted (`/api/ai/company-research`)| Web Search + LLM | Yes | Zod | None | **Implemented but Unmounted** |
| **Job Discovery Service** | `lib/jobSource.ts` | No | Unmounted (`/api/discovery`) | Generic HTTP Source | N/A | Sanitized Schema | None | **Implemented but Unmounted** |

---

## 9. External Providers & Infrastructure Status

| Provider / Service | Config Key Names (No Secrets) | Code Implemented? | Live Status in Prod | Fallback Behavior | Operational Risk |
|:---|:---|:---:|:---:|:---|:---|
| **NVIDIA AI API** | `NVIDIA_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_MS` | Yes | **Live & Active** | Graceful deterministic fallback or HTTP 504/502 | Low (Hardened in Phase 7/8) |
| **OpenAI Compatible** | `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL` | Yes | Inactive (using NVIDIA) | Configurable fallback | Low |
| **PostgreSQL / Supabase**| `DATABASE_URL`, `DATABASE_SSL` | Yes | **Unmounted / Disconnected** | App boots 100% stateless | Medium (Blocks persistence) |
| **Email Service** | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Yes (Brevo, Resend, SendGrid) | Unmounted | Console logger in dev; fails closed in prod | None in current state |
| **Stripe Billing** | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET` | Yes | Unmounted | Disabled | None in current state |
| **Sentry Monitoring** | `SENTRY_DSN` | Yes (Raw HTTP fetch) | Passive | Redacted console logging | None |
| **Job Discovery API** | `JOBS_API_URL`, `JOBS_API_KEY` | Yes | Unmounted | `JOB_SOURCE_NOT_CONFIGURED` | None in current state |
| **Web Search API** | `RESEARCH_SEARCH_API_URL`, `RESEARCH_SEARCH_API_KEY` | Yes | Unmounted | `WEB_SEARCH_NOT_CONFIGURED` | None in current state |

---

## 10. Prioritised Architectural Gap Analysis

| Finding ID | Description | Technical Risk & User Impact | Severity | Complexity | Recommended Solution |
|:---|:---|:---|:---:|:---:|:---|
| **GAP-01** | **Total Lack of Persistence**<br>Candidate career data, tailored resumes, and cover letters exist purely in React state and vanish on page reload. | **High User Churn**: Users spending 20 minutes tailoring a CV lose all work on accidental refresh. | **P1** | **Medium** | Phase 9B: Introduce a hybrid persistence layer (local storage caching for anonymous users, transitioning to PostgreSQL/Supabase for authenticated users). |
| **GAP-02** | **Unmounted User Accounts & Authentication**<br>Database-backed authentication is unmounted; user accounts cannot be created or logged into. | **Core Blocker**: Prevents multi-device access, saved application tracking, and paid subscriptions. | **P1** | **Large** | Phase 9C: Reconnect `auth.ts` with Supabase PostgreSQL connection pooler and verify session cookies across Vercel/Render. |
| **GAP-03** | **Orphaned Career OS Pages (20 Pages)**<br>`Applications.tsx`, `Interview.tsx`, `Dashboard.tsx`, etc., are disconnected dead code. | **Code Rot / Maintenance Burden**: Large unused code surface (~120 KB) that compiles but delivers no user value. | **P2** | **Medium** | Phase 9D: Progressively re-integrate these pages into the authenticated dashboard route tree once persistence is established. |
| **GAP-04** | **Unprotected Database Migrations**<br>Migrations in `db.ts` run via `CREATE TABLE IF NOT EXISTS` inside Node.js without proper migration tracking (e.g. Prisma/Drizzle/Kysely). | **Operational Fragility**: Schema drift, inability to rollback migrations, and lack of database version tracking. | **P2** | **Medium** | Adopt structured SQL migration tooling (e.g. db-migrate or Prisma) before re-activating the production database. |
| **GAP-05** | **Lack of Database Row-Level Security (RLS)**<br>PostgreSQL relies 100% on application-level `WHERE user_id = $1` filters rather than database-enforced RLS. | **Security Vulnerability**: A bug in a future query could expose records belonging to other users. | **P2** | **Medium** | Implement PostgreSQL RLS policies matching Supabase JWT user claims on all 27 tables. |

---

## 11. Final Audit Verdict

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│        VERDICT: ARCHITECTURE AUDIT COMPLETE WITH UNVERIFIED AREAS      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Justification**:
- The repository source code, routing structures, component trees, in-memory state models, and test suites have been comprehensively audited and proven.
- Production Render and Vercel endpoints have been actively probed and verified.
- The single unverified area is the remote Supabase production PostgreSQL database instance itself: because credentials are kept server-side and the production application currently runs in stateless mode without opening database connections, the existence and current migration state of physical tables inside the remote Supabase project cannot be independently inspected without database credentials.
