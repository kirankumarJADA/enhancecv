# Curevo AI — Complete System Architecture, Backend Logic & End-to-End Execution Blueprint

**Document Version:** 1.0.0 (Release Candidate Audit)  
**Repository:** `kirankumarJADA/enhancecv`  
**Git HEAD Baseline:** `794b5eb` (Frontend Release) / `f8582db` (Backend Release)  
**Production Domains:**  
- **Production Frontend:** `https://curevo.dpdns.org` (Vercel previous: `https://enhancecv-orpin.vercel.app`)  
- **Production Backend:** `https://curevo-ai.onrender.com`  
- **Active AI Gateway Model:** `nvidia/nemotron-3-ultra-550b-a55b` via `https://integrate.api.nvidia.com/v1`  
**Investigation Methodology:** Read-only codebase reverse-engineering, line-by-line source verification, and multi-agent specialist inspection.

---

## Table of Contents
1. [Executive Summary & Core Architectural Philosophy](#1-executive-summary--core-architectural-philosophy)
2. [Complete System Architecture & High-Level Topology](#2-complete-system-architecture--high-level-topology)
3. [Frontend Architecture Deep Dive (`web/`)](#3-frontend-architecture-deep-dive-web)
4. [Backend Architecture Deep Dive (`server/src/`)](#4-backend-architecture-deep-dive-serversrc)
5. [The AI Subsystem & NVIDIA Model Integration](#5-the-ai-subsystem--nvidia-model-integration)
6. [The Truth Guard™ Subsystem: Architecture, Logic & Defense Mechanisms](#6-the-truth-guard-subsystem-architecture-logic--defense-mechanisms)
7. [Deterministic Core Processing Engines](#7-deterministic-core-processing-engines)
8. [PDF Generation Engine](#8-pdf-generation-engine)
9. [Complete End-to-End User Journeys (Execution Path Traces)](#9-complete-end-to-end-user-journeys-execution-path-traces)
10. [Complete Route & API Inventory](#10-complete-route--api-inventory)
11. [Data Storage, Lifecycle & Privacy Architecture](#11-data-storage-lifecycle--privacy-architecture)
12. [Authentication, Authorization & Security Architecture](#12-authentication-authorization--security-architecture)
13. [Database Schema, Migrations & State Management](#13-database-schema-migrations--state-management)
14. [Browser Extension Architecture (`extension/`)](#14-browser-extension-architecture-extension)
15. [Automated Testing Architecture & Test Evidence](#15-automated-testing-architecture--test-evidence)
16. [Discrepancies, Unused Code, Legacy Paths & Architectural Gaps](#16-discrepancies-unused-code-legacy-paths--architectural-gaps)
17. [Production Configuration & Deployment Architecture](#17-production-configuration--deployment-architecture)

---

## 1. Executive Summary & Core Architectural Philosophy

Curevo AI is an intelligent career acceleration platform designed to eliminate the fundamental flaws of legacy resume builders: paywalls, account lock-in, data harvesting, and artificial intelligence hallucinations.

### 1.1 The Five Architectural Tenets of Curevo AI

1. **Client-Side Sovereignty & Zero-Database Default (Privacy-First):**  
   The primary production application operates 100% login-free and statelessly. Resumes, job descriptions, interview notes, and tracked applications reside exclusively in the candidate's browser `localStorage` and volatile React memory. Remote database persistence (PostgreSQL) is strictly optional and decoupled; the backend serves all public diagnostic, tailoring, parsing, and export routes without attempting a database connection.
2. **Deterministic Mathematical Foundations (Zero Invented Scores):**  
   All diagnostic metrics—including Applicant Tracking System (ATS) readiness scores (5 standard dimensions and 9 advanced audit dimensions) and Job Match scores (7 weighted components)—are computed by strict deterministic algorithms. Identical inputs mathematically guarantee identical outputs. The AI model is strictly prohibited from inventing or influencing scores.
3. **Truth Guard™ Deterministic Hallucination Enforcement:**  
   LLMs naturally fabricate numbers, inflate leadership headcounts, and exaggerate experience durations. Curevo AI implements Truth Guard™—a deterministic post-generation validation layer that audits every AI-generated claim against explicit facts in the candidate's Master CV. Any bullet violating multi-year experience limits, inventing numerical metrics, or exaggerating leadership scale is automatically rejected and reverted to the verified Master CV baseline.
4. **Zero-Disk Volatile Server Execution:**  
   The backend processes file uploads, PDF/DOCX text extractions, and binary PDF exports entirely in volatile RAM buffers. No temporary files or staging directories (`os.tmpdir()`) touch the server filesystem, ensuring an impenetrable boundary against persistent data leakage.
5. **Universal Public Disclosure Masking:**  
   To prevent provider lock-in and intellectual property leakage, external AI providers and underlying LLM models are strictly masked across all public endpoints and browser telemetry. The system identifies its engine solely as `"AI Engine"` (`model: "AI Engine"` or `"rules-v1"`).

---

## 2. Complete System Architecture & High-Level Topology

The Curevo AI architecture spans three decoupled tiers: the Client Tier (React 18 SPA + Chrome Extension), the Server Tier (Express Node.js REST API with deterministic engines and worker threads), and the Infrastructure Tier (NVIDIA AI, Job Feeds, Transactional Email, and Optional PostgreSQL).

```
                                      CUREVO AI ARCHITECTURAL TOPOLOGY
                                      
  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                                    CLIENT TIER (Browser & Extension)                                   │
  │                                                                                                        │
  │   React 18 Concurrent SPA (web/src)                           Chrome Job Saver Extension (extension/) │
  │   ├── main.tsx (StrictMode + Sentry HTTP Monitor)             ├── manifest.json (MV3)                  │
  │   ├── App.tsx (Router: 7 Active Pages + Canonical Redirects)  ├── popup.html / popup.js                │
  │   ├── LocalStorage Sovereignty (8 Partitioned Keys)           └── content.js (DOM Scraper)             │
  │   └── Web Speech API (Client-side STT & TTS)                                                           │
  └───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                      │ HTTPS (CORS with credentials)
                                                      ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                               SECURITY, RATE LIMITING & GATEWAY TIER                                   │
  │                                                                                                        │
  │   ├── CORS Whitelist (cors.ts: Vercel Production + Localhost)                                          │
  │   ├── Helmet (HSTS, CSP, CORP: 'same-site', nosniff)                                                   │
  │   ├── Sliding-Window In-Memory Rate Limiter (rateLimit.ts)                                             │
  │   ├── Double-Submit Cookie CSRF Protection (csrf.ts: ecv_csrf + X-CSRF-Token)                          │
  │   └── AI Concurrency Guard (public.ts: Max 5 Global, Max 1 Per-IP)                                     │
  └───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                      │ Validated Requests
                                                      ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                               SERVER RUNTIME TIER: Express 4 (server/src)                              │
  │                                                                                                        │
  │   Startup: index.ts ──> config.ts ──> app.ts (Stateless Public Mode Default)                           │
  │                                                                                                        │
  │   ACTIVE ROUTERS (27 Endpoints)                DETERMINISTIC PROCESSING ENGINES (server/src/engine)    │
  │   ├── app.ts (GET /api/health, /api/ai/status) ├── Extraction Engine (extract.ts, isolatedParser.ts)   │
  │   └── public.ts (25 Stateless Endpoints)       │   ├── PDF Worker Thread (pdfjs-dist legacy)           │
  │                                                │   ├── DOCX Worker Thread (mammoth)                    │
  │   OPTIONAL ROUTERS (37 Endpoints)              │   └── Zip-Bomb Binary Guard (zipGuard.ts)             │
  │   ├── auth.ts, profile.ts                      ├── ATS Scoring Engine (ats.ts, audit.ts)               │
  │   └── master.ts, resumes.ts                    ├── Job Match Engine (jd.ts, match.ts)                  │
  │                                                └── PDFKit Streaming Engine (pdf.ts, templates.ts)      │
  │   UNMOUNTED ROUTERS (59 Endpoints -> 404)                                                              │
  │   └── billing, applications, interview, etc.   AI SUBSYSTEM & TRUTH GUARD (server/src/ai)             │
  │                                                ├── OpenAiCompatibleProvider (provider.ts)              │
  │                                                ├── Prompt Specialist Agents (Resume, Cover, Interview) │
  │                                                └── Truth Guard™ Interceptor (tailor.ts)                │
  └───────────────────────────────────┬───────────────────────────────────┬────────────────────────────────┘
                                      │                                   │
                                      ▼                                   ▼
  ┌──────────────────────────────────────────────────┐ ┌──────────────────────────────────────────────────┐
  │           OPTIONAL RELATIONAL PERSISTENCE        │ │        EXTERNAL CLOUD & INFERENCE SERVICES       │
  │                                                  │ │                                                  │
  │   PostgreSQL / Supabase Database (db/db.ts)      │ │   NVIDIA Inference Cloud (integrate.api.nvidia)  │
  │   ├── 25 Relational Tables with Cascade Deletes │ │   ├── Model: nemotron-3-ultra-550b-a55b          │
  │   ├── Row-Level Security (RLS) Tenant Isolation  │ │   Live Job Providers (jobSource.ts)              │
  │   └── Advisory Lock Migration Runner             │ │   ├── Adzuna UK API / Reed UK API / Presets      │
  │   (Active ONLY when ENABLE_DATABASE=true)        │ │   Transactional Email: Brevo / Resend / SendGrid │
  └──────────────────────────────────────────────────┘ └──────────────────────────────────────────────────┘
```

The system architecture diagram is codified in [CUREVO_COMPLETE_SYSTEM_ARCHITECTURE.mmd](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/CUREVO_COMPLETE_SYSTEM_ARCHITECTURE.mmd).

---

## 3. Frontend Architecture Deep Dive (`web/`)

### 3.1 Application Startup & Mounting Sequence
- **Entry Point:** [`web/src/main.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/main.tsx#L1-L22)
- **Startup Execution:**
  1. `initGlobalErrorMonitoring()` ([`web/src/lib/monitoring.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/lib/monitoring.ts#L101-L116)) is called immediately to register error interceptors on `window.onerror` and `window.onunhandledrejection`.
  2. `ReactDOM.createRoot(document.getElementById('root')!)` mounts the React application under `<React.StrictMode>`.
  3. **Global Provider Tree:**
     ```tsx
     <React.StrictMode>
       <BrowserRouter>
         <AuthProvider>
           <ToastProvider>
             <App />
           </ToastProvider>
         </AuthProvider>
       </BrowserRouter>
     </React.StrictMode>
     ```

### 3.2 State Architecture & Persistence Paradigm
Curevo AI rejects heavyweight state management frameworks (no Redux, MobX, or Zustand). The application relies exclusively on:
1. **Component-Scoped React State:** Fast in-memory state hooks (`useState`, `useReducer`, `useMemo`) for active editing and interactions.
2. **Context Providers for Cross-Cutting Concerns:**
   - `AuthProvider` ([`web/src/state/AuthContext.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/state/AuthContext.tsx)): Tracks ambient user identity via `GET /auth/me`. When unauthenticated, cleanly exposes `user: null`, allowing all public features to run.
   - `ToastProvider` ([`web/src/state/ToastContext.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/state/ToastContext.tsx)): Fixed notification toasts auto-dismissed after 4,200ms.
3. **Client-Side Storage Modules (`web/src/lib/`):**
   - Pure, tested modules encapsulate browser `localStorage` access with quota guards, account isolation, and JSON serialization.

### 3.3 Complete Route Specification (`web/src/App.tsx`)
Defined in [`web/src/App.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/App.tsx#L10-L53):

| Route Path | Type | Component Target | Architectural Role |
| :--- | :--- | :--- | :--- |
| `/` | Page | `<Landing />` | Public marketing hero, interactive feature demos, FAQ, extension download |
| `/builder` | Page | `<PublicBuilder />` | Core flagship resume builder, parser, ATS audit & tailoring engine |
| `/ats` | Redirect | `<Navigate to="/builder?mode=ats" replace />` | Canonical alias for ATS diagnostic mode |
| `/check-ats` | Redirect | `<Navigate to="/builder?mode=ats" replace />` | Canonical alias for ATS diagnostic mode |
| `/tailor` | Redirect | `<Navigate to="/builder?mode=improve" replace />` | Canonical alias for resume tailoring mode |
| `/prepare-application` | Page | `<PrepareApplication />` | Unified 5-step guided job application preparation wizard |
| `/prepare` | Redirect | `<Navigate to="/prepare-application" replace />` | Shorthand alias for application prep wizard |
| `/jobs` | Page | `<Jobs />` | Public job search, filtering, and real-time CV match scoring |
| `/jobs-discovery` | Redirect | `<Navigate to="/jobs" replace />` | Shorthand alias for job discovery |
| `/applications` | Page | `<Applications />` | 5-stage Kanban application tracking pipeline |
| `/tracker` | Redirect | `<Navigate to="/applications" replace />` | Shorthand alias for application tracking pipeline |
| `/interview` | Page | `<Interview />` | AI interview prep packs, STAR story coach, voice mock interview |
| `/interview/:id` | Page | `<Interview />` | Deep-link to specific saved interview session |
| `/interview-prep` | Redirect | `<Navigate to="/interview" replace />` | Shorthand alias for interview prep |
| `/linkedin` | Page | `<LinkedIn />` | LinkedIn profile optimizer & recruiter keyword booster |
| `/linkedin-optimizer` | Redirect | `<Navigate to="/linkedin" replace />` | Shorthand alias for LinkedIn optimizer |
| `/login` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy auth path to public builder |
| `/signup` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy auth path to public builder |
| `/onboarding` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy onboarding path to public builder |
| `/forgot-password` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy auth path to public builder |
| `/reset-password` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy auth path to public builder |
| `/verify-email` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy auth path to public builder |
| `/app/*` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy authenticated shell to public builder |
| `/app` | Obsolete Redirect | `<Navigate to="/builder" replace />` | Redirects legacy authenticated shell to public builder |
| `*` | Fallback | `<Navigate to="/" replace />` | Wildcard route fallback to landing page |

### 3.4 API Client Architecture & URL Normalization
- **Client Implementation:** [`web/src/api.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/api.ts) & [`web/src/apiBase.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/apiBase.ts)
- **Dynamic Base URL Resolution:**
  - `export const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL);`
  - In development (`VITE_API_URL` unset): `API_BASE` is `''`. All requests hit `/api/...` and are proxied by Vite dev server ([`web/vite.config.ts#L8-L13`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/vite.config.ts#L8-L13)) to `http://localhost:4000`.
  - In production (`VITE_API_URL` set at build time, e.g. `https://curevo-ai.onrender.com`): Requests target `${API_BASE}/api/...`.
- **Credentials Policy:** Every fetch call specifies `credentials: 'include'` to pass cookies cross-origin.
- **CSRF Token Synchronization:** Checks `inMemoryCsrfToken` and parses `document.cookie` for `ecv_csrf`. Non-GET mutative requests automatically fetch `GET /auth/csrf` when necessary and inject `X-CSRF-Token`.
- **Binary Download Helper (`downloadPdfBlob`):** Transmits JSON payload via POST, captures binary `Blob`, creates a temporary object URL (`window.URL.createObjectURL(blob)`), simulates anchor click (`a.download`), and immediately revokes the URL (`window.URL.revokeObjectURL(url)`).

---

## 4. Backend Architecture Deep Dive (`server/src/`)

### 4.1 Server Startup Sequence
- **Startup Trace:** `server/src/index.ts` $\longrightarrow$ `server/src/config.ts` $\longrightarrow$ `server/src/app.ts`
- **Configuration Loading:**
  - Evaluates `process.env.PORT` (default 4000).
  - Asserts production JWT secret safety via `assertJwtSecretIsSafe()`. In production, the server **refuses to boot** if `JWT_SECRET` is unset, default, or shorter than 32 characters.
  - Checks `ENABLE_DATABASE` and `DATABASE_URL`.
  - **Graceful Failure Invariant:** If database initialization fails, the error is caught, logged as a warning, and startup continues in stateless mode.

### 4.2 Middleware Pipeline (Strict Execution Order)
1. **Async Layer Monkey-Patch (`server/src/middleware/async.ts`):** Express 4 `Layer.prototype.handle_request` is patched to intercept unhandled promise rejections from async route handlers and route them to `next(err)`.
2. **Security Headers (`helmet`):** `x-powered-by` disabled, CSP enabled in production, CORP set to `same-site`, `nosniff`, `HSTS`.
3. **Request Correlation ID:** Injects `req.requestId = newRequestId()` (8-byte random hex) and sets `X-Request-Id` response header.
4. **CORS Middleware (`server/src/lib/cors.ts`):** Validates origin against `FRONTEND_URL` and development origins. Requires credentials; never emits `'*'`.
5. **JSON Body Parser:** `express.json({ limit: '1mb' })`.
6. **Cookie Parser:** `cookieParser()`.
7. **Rate Limiting:** Sliding-window in-memory limiter with per-endpoint thresholds.
8. **Double-Submit CSRF Guard (`server/src/middleware/csrf.ts`):** Validates `Origin` header and checks `X-CSRF-Token` against `ecv_csrf` cookie for mutative requests.
9. **Centralized Error Handler (`server/src/middleware/errors.ts`):** Maps Zod errors to 400, system errors to friendly JSON responses, scrubs PII patterns, and returns the correlation `requestId`.

---

## 5. The AI Subsystem & NVIDIA Model Integration

### 5.1 Provider Abstraction & Model Configuration
- **Core Module:** [`server/src/ai/provider.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/ai/provider.ts)
- **Active Model Configuration:**
  - **Provider:** NVIDIA Cloud Gateway (`https://integrate.api.nvidia.com/v1`)
  - **Model ID:** `nvidia/nemotron-3-ultra-550b-a55b`
  - **Sampling Temperature:** `0.2` (Deterministic, low-creativity generation)
  - **Reasoning Effort:** `reasoning_effort: 'medium'` (Native chain-of-thought activation)
  - **Token Window:** `max_tokens: 8192` (Default attempt), dynamically retried up to `32768` on token truncation.
  - **Template Kwargs:** `chat_template_kwargs` is **strictly omitted** to prevent gateway 422 errors.

### 5.2 Structured Completion & Reasoning Trace Stripping
- **Schema Validation:** Every AI generation must pass through `completeJson<T>({ system, user, schema })` validated against a strict Zod schema.
- **Embedded Reasoning Cleanup:** If the Nemotron model outputs `<think>...</think>` traces inside its completion content, `provider.ts#L287-L289` strips them using:
  ```ts
  if (content.includes('<think>')) {
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  }
  ```
- **Public Disclosure Masking:** `getAiStatus()` masks provider details, returning:
  ```json
  {
    "enabled": true,
    "provider": "AI Engine",
    "model": "AI Engine",
    "maxIterations": 2
  }
  ```

---

## 6. The Truth Guard™ Subsystem: Architecture, Logic & Defense Mechanisms

Truth Guard™ is Curevo AI's deterministic defense layer that prevents AI models from inventing career facts, inflating numbers, or fabricating leadership experience.

### 6.1 Defense Vector 1: Multi-Year Experience Duration Bounds
- **Vulnerability Addressed:** AI models routinely turn "5 years" of experience into "12 years" to match senior job requirements.
- **Implementation:** [`server/src/engine/tailor.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/engine/tailor.ts#L260-L380)
- **Mathematical Interval Union:** Rather than naively summing year gaps (which over-counts overlapping roles), `calculateIntervalUnionYears(master)` converts all experience entries into calendar intervals and computes their true mathematical union.
- **Verification Rule:** If a candidate has 5.2 years of total verified career history, any generated bullet claiming $>5$ years (e.g. *"Led engineering teams for 12 years"*) is flagged as a critical violation and rejected.

### 6.2 Defense Vector 2: Multiset Numeric Metric Verification
- **Vulnerability Addressed:** AI inventing revenue numbers ($50M), percentage gains (400%), or team sizes (50 engineers).
- **Implementation:** `extractNumbers(bullet)` extracts all numeric tokens.
- **Multiset Containment:** `masterNumbers` harvests every number in the Master CV. A generated bullet is truthful if and only if all numbers in the tailored bullet are members of `masterNumbers` or satisfy legitimate semantic exceptions (e.g. semantic versioning numbers like `17` in Java 17, or numbers $\le$ verified bounds).

### 6.3 Defense Vector 3: Leadership & Headcount Bounds
- **Function:** `getSupportedHeadcount(master)` scans the Master CV for verified team sizes.
- **Rule:** If the Master CV only supports leading a team of 4, a tailored bullet claiming to manage "35 engineers" is automatically rejected.

### 6.4 Automatic Baseline Reversion
When Truth Guard detects a hallucination or fact violation:
1. The tailored bullet is rejected.
2. The engine immediately reverts to the exact verified source bullet from the Master CV.
3. The violation is logged in `changeLog` with `rejectedCount` incremented.
4. The API response guarantees that zero unevidenced facts reach the candidate's final resume.

---

## 7. Deterministic Core Processing Engines

### 7.1 ATS Scoring Engine (`server/src/engine/ats.ts`, `server/src/engine/audit.ts`)
- **Deterministic Five Dimensions & Weights:**
  - Formatting (20%): Standard headings, valid contact info, consistent date formats, length budget.
  - Structure (20%): Experience entries, education presence, summary length, bullets per role.
  - Content (30%): Bullet count, power action verbs, quantified metrics, weak opener avoidance, repetition avoidance.
  - Skills (20%): Technical skill presence (6–30), organization, canonical industry taxonomy recognition, generic fluff avoidance.
  - Readability (10%): Scannable word lengths (6–40 words), first-person pronoun avoidance, punctuation consistency.
- **Advanced 9-Dimension Audit (`audit.ts`):** Evaluates parsing integrity, quantification ratio, repetition, common spelling typos, format consistency, section hierarchy, recruiter hygiene, and inclusive terminology.

### 7.2 Ingestion & Parsing Engine (`server/src/engine/extract.ts`)
- **PDF Extraction:** Handled inside dedicated Node.js `Worker` threads running `pdfjs-dist` with a 15-second timeout and 20-page cap. Detects two-column layout gutters.
- **DOCX Extraction:** Validated against `zipGuard.ts` for zip bombs (max 250 entries, max 20MB uncompressed, max 15:1 compression ratio). Ingested via `mammoth` in an isolated worker thread.
- **Zero Disk Footprint:** All parsing occurs in volatile RAM buffers.

### 7.3 Job Matching Engine (`server/src/engine/match.ts`)
- Computes an explainable Job Match Score (0–100%) across 7 weighted components:
  $$\text{Required Skills (35\%)} + \text{Responsibilities (15\%)} + \text{Experience Relevance (15\%)} + \text{Preferred Skills (10\%)} + \text{Project Overlap (10\%)} + \text{Keywords (10\%)} + \text{Education (5\%)}$$
- Tags every requirement with `EvidenceProvenance`: `source_cv` (verified fact) vs `unsupported` (gap).

---

## 8. PDF Generation Engine

- **Implementation:** [`server/src/engine/pdf.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/engine/pdf.ts)
- **Engine:** `pdfkit` direct streaming pipe (`stream.pipe(res)`).
- **Layout Standards:** Strict single-column ATS safety. No tables, graphics, or text frames that confuse parsers.
- **Unicode Sanitization:** `sanitizePdfText()` maps smart quotes, em-dashes, non-breaking spaces, and non-WinAnsi currency symbols to standard ASCII equivalents, preventing rendering crashes and glyph corruption.
- **Templates:** 6 professional layouts (Classic, Modern, Minimal, Professional, Technical, Executive) with 3 margin densities (Compact, Normal, Spacious) and A4 / Letter sizing.

---

## 9. Complete End-to-End User Journeys (Execution Path Traces)

The 10 complete user journeys—from first-time visitor landing, file parsing, cold creation, tailoring, cover letter generation, job discovery, Kanban tracking, mock interviews, LinkedIn optimization, to data sovereignty—are fully detailed in [CUREVO_COMPLETE_USER_JOURNEY_FLOWS.mmd](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/CUREVO_COMPLETE_USER_JOURNEY_FLOWS.mmd).

---

## 10. Complete Route & API Inventory

The complete inventory of all 113 endpoints across all 17 router files is cataloged in [CUREVO_API_AND_SERVICE_INVENTORY.md](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/CUREVO_API_AND_SERVICE_INVENTORY.md).

---

## 11. Data Storage, Lifecycle & Privacy Architecture

The exhaustive audit of all 18 storage vectors, client-side data deletion functions, and PII scrubbing rules is documented in [CUREVO_DATA_LIFECYCLE_AND_PRIVACY_MAP.md](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/CUREVO_DATA_LIFECYCLE_AND_PRIVACY_MAP.md).

---

## 12. Authentication, Authorization & Security Architecture

### 12.1 Authentication & Session Management (`server/src/middleware/auth.ts`)
- **Dual Authentication Mechanism:**
  1. **Ambient Session Cookie (`ecv_session`):** Signed JWT verified with `getJwtSecret()`. Validates claims (`uid`, `jti`, `sv`). Calls `getSessionState(jti, uid)` in PostgreSQL to verify device session has not been revoked.
  2. **Bearer Token Authorization:** Header `Authorization: Bearer <token>` verified via SHA-256 hash match against `extension_tokens` table for browser extension integration.
- **Fail-Closed Principle:** If PostgreSQL is unreachable during session verification, `requireAuth` returns `503 AUTH_UNAVAILABLE` rather than allowing unverified access.

### 12.2 CSRF Protection Architecture (`server/src/middleware/csrf.ts`)
- Implements Double-Submit Cookie pattern.
- State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require `Origin` header validation against `allowedOrigins()` and constant-time match between `X-CSRF-Token` header and `ecv_csrf` cookie.
- Requests carrying Bearer tokens are exempt (non-ambient credentials).

---

## 13. Database Schema, Migrations & State Management

- **Database Engine:** PostgreSQL (Version 14+). Fully optional in public mode.
- **Schema Management (`server/src/db/migrations.ts`):** 4 tracked migrations executed with PostgreSQL advisory lock `pg_advisory_xact_lock(7429184)` to prevent race conditions during multi-instance container startups.
- **Schema Tables (25 Tables):** `users`, `user_sessions`, `email_verification_tokens`, `password_reset_tokens`, `master_cvs`, `master_cv_versions`, `tailored_resume_versions`, `resumes`, `job_descriptions`, `job_analyses`, `ats_analyses`, `match_analyses`, `tailoring_runs`, `ai_runs`, `applications`, `application_events`, `cover_letters`, `linkedin_generations`, `saved_jobs`, `job_searches`, `interview_sessions`, `interview_questions`, `interview_answers`, `company_research`, `schema_migrations`.
- **Tenant Isolation:** Row-Level Security (`FORCE ROW LEVEL SECURITY`) applied across user-owned tables, scoped to `current_setting('app.current_user_id', true)`.

---

## 14. Browser Extension Architecture (`extension/`)

- **Manifest:** Manifest V3 (`extension/manifest.json`).
- **Permissions:** `activeTab`, `storage`, `scripting`.
- **Host Permissions:** `<all_urls>` (for DOM job extraction) and `http://localhost:4000/*`, `https://curevo-ai.onrender.com/*`, `https://curevo.dpdns.org/*`.
- **Workflows:**
  - `content.js`: Injected into job board pages (LinkedIn, Indeed, Glassdoor) to extract job title, company, location, and description text from DOM selectors.
  - `popup.js`: Allows candidates to test API connectivity, input API tokens, or 1-click export the extracted vacancy directly to Curevo AI via URL query parameters.

---

## 15. Automated Testing Architecture & Test Evidence

The repository maintains an extensive test suite verifying mathematical engines, security gates, and UI workflows:
1. **Backend Test Suite (`server/tests/`):**
   - 452 Passed, 15 Skipped across 31 test suites run via `vitest run --pool=forks`.
   - Tests cover Truth Guard invariants (`truth-guard-hardening.test.ts`), ATS score determinism (`ats.test.ts`), isolated worker parsing (`worker-parser.test.ts`), zip bomb defense (`zip-guard.test.ts`), and database pool resilience (`db-pool.test.ts`).
2. **Frontend Test Suite (`web/tests/`):**
   - 178 Passed across 15 test suites.
   - Tests cover draft storage isolation (`draftAccountIsolation.test.ts`), writing coach feedback (`writingCoach.test.ts`), and user data export (`userDataExport.test.ts`).

---

## 16. Discrepancies, Unused Code, Legacy Paths & Architectural Gaps

1. **Storage Key Name Discrepancy:**  
   In [`web/src/lib/userDataExport.ts#L25`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/lib/userDataExport.ts#L25), `STORAGE_KEYS.resumeDraft` is defined as `'curevo_draft_anonymous_v1'`, whereas [`web/src/lib/draftStorage.ts#L30`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/lib/draftStorage.ts#L30) persists under `'curevo_builder_draft_v1_anonymous'`. This represents a legacy compatibility alias.
2. **Missing Process Shutdown Handlers:**  
   `server/src/index.ts` lacks explicit `process.on('SIGTERM')` and `process.on('SIGINT')` signal handlers. Container shutdowns terminate Node immediately rather than waiting for active connections to drain or closing the `pg.Pool`.
3. **Unmounted Backend Routes:**  
   11 router files (`admin.ts`, `ai.ts`, `applications.ts`, `billing.ts`, `dashboard.ts`, `discovery.ts`, `imports.ts`, `insights.ts`, `interview.ts`, `jobs.ts`, `templates.ts`) containing 59 endpoints remain unmounted in `server/src/app.ts` as the application transitioned to its public-first stateless architecture.
4. **No `optionalAuth` Middleware:**  
   Routes either require authentication (`requireAuth`) or are public. There is no intermediate optional authentication middleware.

---

## 17. Production Configuration & Deployment Architecture

- **Frontend Deployment:** Hosted on Vercel (`https://curevo.dpdns.org`, previous: `https://enhancecv-orpin.vercel.app`). Deployed as a static SPA bundle generated via `vite build`.
- **Backend Deployment:** Hosted on Render (`https://curevo-ai.onrender.com`). Deployed as a Node.js web service running `node dist/index.js`.
- **Environment Variables:**
  - `PORT`: Server listen port (default 4000).
  - `NODE_ENV`: Set to `production`.
  - `FRONTEND_URL`: `https://curevo.dpdns.org` (and Vercel URL).
  - `APP_URL`: Production web application root.
  - `JWT_SECRET`: Minimum 32-character cryptographically secure key.
  - `NVIDIA_API_KEY`: Inference authentication key.
  - `AI_MODEL`: `nvidia/nemotron-3-ultra-550b-a55b`.
  - `AI_BASE_URL`: `https://integrate.api.nvidia.com/v1`.
  - `DATABASE_URL`: Optional PostgreSQL connection string. (When omitted, the backend runs in 100% stateless public mode).
  - `ENABLE_DATABASE`: Set to `'true'` only when PostgreSQL persistence is required.
  - `EMAIL_PROVIDER` & `EMAIL_API_KEY`: Optional Brevo/Resend credentials for transactional dispatch.
  - `SENTRY_DSN`: Optional monitoring DSN.

---
*Curevo AI Master Technical Blueprint completed. All citations and implementations verified directly against the enhancecv codebase.*
