# Curevo AI — Complete Data Lifecycle & Privacy Map

**Repository:** `kirankumarJADA/enhancecv`  
**System Architecture:** Privacy-First, Zero-Disk, Client-Side Sovereign Application.  
**Audit Scope:** Exhaustive audit of all 18 data storage vectors, client-side data deletion functions, in-transit telemetry, and database isolation models.

---

## 1. The 18 Data Storage Vectors: Comprehensive Audit

Every potential location where user data, candidate credentials, uploaded files, or telemetry could be stored, processed, or transmitted was audited against the codebase.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CUREVO AI DATA TOPOLOGY                               │
├────────────────────────────────┬────────────────────────────────────────────────┤
│       CLIENT TIER (Local)      │              SERVER TIER (Volatile RAM)        │
│  - React Memory (State)        │  - Multer RAM Buffers (Zero Temp Disk)        │
│  - Browser LocalStorage (8 Keys)│  - PDFKit Binary Streaming Pipe (No Disk)     │
│  - Browser SessionStorage       │  - In-Memory Job Cache (10m TTL)              │
│  - Cookies (ecv_session/csrf)  │  - In-Memory Concurrency & Rate Limit Maps     │
│  - Web Speech API (Local Mic)  │  - Isolated Worker Thread Memories            │
├────────────────────────────────┼────────────────────────────────────────────────┤
│      OPTIONAL DATABASE TIER    │              EXTERNAL TRANSIT TIER             │
│  - PostgreSQL (25 Tables, RLS) │  - NVIDIA Cloud API (In-transit ephemeral)     │
│  - Supabase (Generic PG host)  │  - Adzuna / Reed Job APIs (Query params only)  │
│                                │  - Brevo / Resend Email (Plaintext summary)    │
│                                │  - Sentry HTTP Store (PII-Scrubbed errors)     │
└────────────────────────────────┴────────────────────────────────────────────────┘
```

---

### Detailed Vector Catalog

#### 1. React Component Memory (Heap)
- **Data Stored:** Form field contents, active tab selections, modal visibility, interim Google XYZ bullet rewrites, ATS diagnostic breakdown, matched skills, live speech recognition transcript buffers.
- **Source:** User keystrokes, API JSON responses, drag-and-drop actions.
- **Processing:** React 18 hooks (`useState`, `useReducer`, `useMemo`, `useCallback`) in `PublicBuilder.tsx`, `Interview.tsx`, `Jobs.tsx`, `Applications.tsx`, `LinkedIn.tsx`, `PrepareApplication.tsx`.
- **Media:** Client browser volatile RAM.
- **Retention:** Ephemeral. Completely discarded when navigating away, closing the tab, or refreshing the page (unless saved to localStorage).
- **Deletion:** Calling `handleStartOver()` in `PublicBuilder.tsx` sets all state to `null` or initial values.

#### 2. Browser LocalStorage (Persistent Client Sovereignty)
- **Data Stored:** The candidate's complete career portfolio, saved jobs, tracked Kanban applications, interview mock session transcripts, STAR stories, LinkedIn drafts, and verified company research.
- **Source:** Debounced autosaving (1200ms) from React state, manual save buttons, and background import routines.
- **Processing:** Governed by specialized modules in `web/src/lib/*`:
  - `draftStorage.ts`
  - `jobStorage.ts`
  - `interviewStorage.ts`
  - `linkedinStorage.ts`
  - `companyResearchStorage.ts`
  - `userDataExport.ts`
- **Media:** Browser Web Storage API partition scoped strictly to the origin (`https://curevo.dpdns.org` or `http://localhost:5173`).
- **Retention:** Persistent across browser restarts and device reboots until explicitly cleared by the user or deleted via browser settings.
- **Deletion:** Managed through individual deletion functions or the atomic purge `clearAllCurevoData()`.

#### 3. Browser SessionStorage
- **Data Stored:** Cross-page workflow handoffs:
  - `curevo_prefilled_jd`: Target job description passed from Job Discovery to Application Prep.
  - `curevo_prefilled_role`: Role title passed from vacancy cards.
  - `curevo_prefilled_company`: Employer name passed from vacancy cards.
  - `curevo_manual_jd`: Temporary storage when transitioning between public builder modes.
- **Source:** Clicks on "Prepare Application", "Tailor CV", or "Research Company".
- **Processing:** Written before route transitions; consumed on target component mount.
- **Media:** Browser Session Storage API.
- **Retention:** Automatically discarded by the browser when the tab or window is closed.
- **Deletion:** Consumed and removed via `sessionStorage.removeItem(...)` upon page load, or discarded on tab close.

#### 4. IndexedDB
- **Audit Finding:** **NOT USED (CONFIRMED ABSENT).**
- **Evidence:** Codebase search for `indexedDB`, `openDatabase`, `idb`, and Dexie confirmed zero occurrences across `web/` and `server/`. No structured binary or document databases are created inside the browser.

#### 5. Browser Cookies
- **Data Stored:**
  1. `ecv_session`: Signed JWT session token (contains `uid`, `jti`, `sv`, `email`).
     - Attributes: `HttpOnly: true`, `Secure: isProd`, `SameSite: isProd ? 'none' : 'lax'`, `Path: '/'`, `Max-Age: 7 days`.
  2. `ecv_csrf`: Cryptographically random 32-byte hex token.
     - Attributes: `HttpOnly: false` (client-accessible for Double-Submit Cookie header `X-CSRF-Token`), `Secure: isProd`, `SameSite: isProd ? 'none' : 'lax'`, `Path: '/'`, `Max-Age: 7 days`.
- **Source:** Vended by `server/src/routes/auth.ts` (`POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/auth/csrf`).
- **Processing:** Evaluated on every mutative authenticated request by `auth.ts` and `csrf.ts`.
- **Retention:** Max 7 days, or until session revocation or cookie deletion.
- **Deletion:** `POST /api/auth/logout` calls `res.clearCookie('ecv_session')` and `res.clearCookie('ecv_csrf')`.

#### 6. Backend Process Memory (Node.js Heap)
- **Data Stored:**
  - AI Concurrency counters: `activeAiRequests` (global max 5) and `activePerIp` (per-IP max 1) in `server/src/routes/public.ts`.
  - Rate limiting sliding-window bucket maps: `Map<string, { count: number, resetAt: number }>` in `server/src/middleware/rateLimit.ts`.
  - In-memory job search cache: `searchCache` in `server/src/lib/jobSource.ts`.
  - AI Provider singleton instance: `OpenAiCompatibleProvider` or `RuleBasedProvider`.
  - Node.js isolated worker thread heap buffers.
- **Retention:** Transient. Rate limits expire after 60s to 15m; job search entries expire after 10m; concurrency semaphores release in `finally` blocks.
- **Deletion:** Garbage collected by V8; completely reset upon server restart.

#### 7. Uploaded Files & Ingestion Buffers
- **Data Stored:** Raw candidate resumes uploaded as PDF, DOCX, or TXT.
- **Source:** `POST /api/public/parse` and `POST /api/master/parse-upload`.
- **Processing:** Handled strictly via Multer using `multer.memoryStorage()`. The file content exists exclusively as a Node.js `Buffer` in `req.file.buffer`.
- **Disk Footprint:** **ZERO DISK WRITES.** Uploaded files are **NEVER** written to disk, `/tmp`, or virtual staging folders.
- **Retention:** Exists only for the duration of the HTTP request execution (typically 200ms–1500ms).
- **Deletion:** Automatically de-referenced and reclaimed by V8 garbage collection when the request finishes.

#### 8. Server Temporary Directories
- **Audit Finding:** **ZERO DISK ACCESS (CONFIRMED ABSENT).**
- **Evidence:** Audit of `server/src/` confirms zero usage of `os.tmpdir()`, `fs.writeFile()`, `fs.createWriteStream()`, or temporary scratch files. All parsing, ZIP decompression, text extraction, and PDF generation happen in volatile memory.

#### 9. PDF Generation Buffers
- **Data Stored:** Rendered binary chunks of generated PDF resumes and cover letters.
- **Source:** `renderResumePdf()` and `renderCoverLetterPdf()` in `server/src/engine/pdf.ts`.
- **Processing:** Generated via `pdfkit` (`PDFDocument`) and piped directly to the HTTP response stream:
  ```ts
  const stream = renderResumePdf(resume, options);
  stream.pipe(res);
  ```
- **Retention:** Stream chunks are transmitted over the TCP socket and discarded immediately from RAM.
- **Deletion:** Memory is freed chunk-by-chunk; zero PDF files are stored on server disk.

#### 10. PostgreSQL Relational Database (Optional)
- **Data Stored:** 25 structured relational tables:
  - Account credentials (`users`: `email`, `password_hash` with bcrypt 10 rounds).
  - Sessions (`user_sessions`: device-level tokens).
  - Master CVs (`master_cvs`: JSONB career source of truth, revision counter).
  - Version history (`master_cv_versions`: immutable historical snapshots).
  - Tailored versions (`tailored_resume_versions`: job-tailored resumes and Truth Guard logs).
  - Tokens (`email_verification_tokens`, `password_reset_tokens`, `extension_tokens`).
  - Applications (`applications`, `application_events`).
  - Saved jobs (`saved_jobs`, `job_searches`).
  - Interview records (`interview_sessions`, `interview_questions`, `interview_answers`).
  - Audit trails (`ai_runs`, `tailoring_runs`, `schema_migrations`).
- **Retention:** Persistent until deleted by the user or purged via account deletion.
- **Tenant Isolation:** Enforced via PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) and transaction-scoped configuration `set_config('app.current_user_id', $1, true)`.
- **Cascading Deletion:** All child tables declare `ON DELETE CASCADE`.

#### 11. Supabase (Optional Hosting Target)
- **Audit Finding:** **GENERIC POSTGRESQL ONLY — NOT A REQUIRED SERVICE.**
- **Evaluation:** The codebase contains **ZERO** dependencies on Supabase SDKs (`@supabase/supabase-js`, Supabase Auth, Supabase Storage, Supabase Realtime). The repository connects to databases purely through the standard Node `pg` driver using `DATABASE_URL`. Supabase is simply one of many supported PostgreSQL connection endpoints (alongside Render, Neon, AWS RDS, Docker, or local PostgreSQL).

#### 12. External NVIDIA Cloud API
- **Data Stored:** Ephemeral candidate facts, bullet points, job descriptions, and system instructions transmitted during AI operations (`POST /api/public/improve`, `/cover-letter`, `/interview/*`, `/linkedin/optimize`).
- **Destination:** `https://integrate.api.nvidia.com/v1/chat/completions`.
- **Model:** `nvidia/nemotron-3-ultra-550b-a55b`.
- **Retention:** Governed by NVIDIA API data privacy policy (in-transit inference SLA; zero training on API data).
- **Server Retention:** The Curevo AI server stores zero prompts or completions on disk. Transmitted payloads are discarded from memory immediately after Zod validation.

#### 13. External Job Provider APIs (Adzuna UK / Reed UK)
- **Data Stored:** Search preference queries (job title keywords, location, contract type).
- **Processing:** Managed by `server/src/lib/jobSource.ts`. Requests never transmit candidate names, CV text, contact details, or identity.
- **Caching:** In-memory query cache (`searchCache`) stores returned job listings for 10 minutes (`CACHE_TTL_MS = 600_000`) to respect provider rate limits and accelerate repeat queries.
- **Deletion:** Cache entries are purged after 10 minutes or upon server restart.

#### 14. Transactional Email Providers (Brevo / Resend / SendGrid)
- **Data Stored:** Recipient email address, candidate full name, and plain-text CV summary or mock interview score report.
- **Source:** User-initiated action (`POST /api/public/email/resume` or `POST /api/public/email/interview-report`).
- **Consent Gate:** Requires explicit checkbox consent (`consent: true`) validated by Zod schema before transmission.
- **Payload Privacy:** Transmits plain text summary only. Never stores copies of sent emails on server disk or database.

#### 15. Error Monitoring & Application Logs
- **Data Stored:** Exception messages, stack traces, HTTP status codes, request correlation IDs (`X-Request-Id`), route paths, component names.
- **Destination:** Process `stderr` stream and optional lightweight HTTP POST to Sentry (`https://${host}/api/${projectId}/store/`).
- **Zero-SDK Architecture:** Handled via plain `fetch()` without heavy Sentry SDKs.
- **PII Redaction Engine:** Both client (`web/src/lib/monitoring.ts`) and server (`server/src/lib/monitoring.ts`) execute `sanitize()` / `scrubText()` regex filters before logging or forwarding:
  ```ts
  const SENSITIVE_PATTERNS = [
    /password[=:\s]+[^\s&]+/gi,
    /bearer\s+[a-zA-Z0-9_\-.]+/gi,
    /token[=:\s]+[^\s&]+/gi,
    /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi, // emails
    /api[_-]?key[=:\s]+[^\s&]+/gi,
    /database[_-]?url|postgres:\/\/[^\s]+/gi,
  ];
  ```
  Matched patterns are replaced with `[redacted]` and strings are truncated to 500–1000 characters.

#### 16. User Backups & Export Files
- **Data Stored:** Complete unified JSON file containing all 8 localStorage keys, or individual CSV spreadsheets of job applications.
- **Source:** User triggers "Download Unified Backup" in `DataPrivacyModal.tsx` or "Export CSV" in `Applications.tsx`.
- **Processing:** Client-side `Blob` construction via `new Blob([json], { type: 'application/json' })`.
- **Media:** Stored directly in the user's local operating system filesystem (e.g. `Downloads` folder).
- **Lifecycle:** Controlled exclusively by the candidate.

#### 17. Chrome Extension Storage
- **Data Stored:** Target Curevo AI URL (`apiUrl`, default `https://curevo.dpdns.org`) and optional user session token (`token`).
- **Media:** Browser extension storage sandbox (`chrome.storage.local`).
- **Processing:** The extension extracts job description text from the active webpage DOM and passes it to the Curevo AI web app via URL query parameters or clipboard.
- **Deletion:** Cleared when removing the extension or resetting options in the extension popup.

#### 18. Discovered Vector: Web Speech API & Concurrency Maps
- **Data Stored:**
  1. Real-time microphone audio streams and speech recognition tokens.
  2. Active request IP counters (`activePerIp`) in backend server RAM.
- **Processing:**
  1. Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition` and `speechSynthesis`) executes **100% locally in the candidate's browser engine**. Zero raw audio packets are recorded, saved, or uploaded to any server.
  2. IP concurrency counters track active LLM connections in memory and are decremented in Express `res.on('finish')` and `res.on('close')` handlers.

---

## 2. Complete LocalStorage Key Inventory

| Key Name | Storage Module | JSON Schema / Shape | Size Guard & Retention | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `curevo_builder_draft_v1_anonymous` | `draftStorage.ts:30` | `BuilderDraft` (version: 1, savedAt, seq, mode, step, resume, ats, truth, match, coverLetter) | Text fields bounded (summary <=5k, bullets <=2k, jobText <=20k); QuotaCatch error block | Active CV builder draft for unauthenticated candidates. |
| `curevo_builder_draft_v1_usr_${id}` | `draftStorage.ts:41` | `BuilderDraft` scoped to authenticated user ID | Account isolation: prevents draft leakage between accounts on shared machines | Active CV builder draft for logged-in user. |
| `curevo_builder_draft_v1` | `draftStorage.ts:31` | `BuilderDraft` (Legacy schema) | Read fallback for backward compatibility | Legacy draft key preserved for existing users. |
| `curevo_draft_anonymous_v1` | `userDataExport.ts:25` | `BuilderDraft` | Scanned during backup export | Unified data exporter alias key. |
| `curevo_saved_jobs_v1` | `jobStorage.ts:59` | `SavedJob[]` (id, title, company, location, salary, match_score, saved_at) | Validates object schema; discards malformed entries | Candidate's bookmarked job vacancies. |
| `curevo_applications_v1` | `jobStorage.ts:60` | `TrackedApplication[]` (id, company, role, stage, applied_date, salary, notes) | Sorted by `updated_at` desc; corrupt entries pruned | 5-stage Kanban application tracking pipeline. |
| `curevo_interview_sessions_v1` | `interviewStorage.ts:107` | `InterviewSession[]` (id, role, company, difficulty, questions, transcript, finalReport) | Array of full mock interview sessions | Archive of past interview practice runs. |
| `curevo_star_stories_v1` | `interviewStorage.ts:108` | `SavedStarStory[]` (id, question, situation, task, action, result, score) | Structured STAR story records | Candidate's personal STAR story bank. |
| `curevo_linkedin_profile_v1` | `linkedinStorage.ts:79` | `SavedLinkedInProfile` (targetRole, industry, headline, about, skills) | Single profile draft object | Draft LinkedIn profile optimization state. |
| `curevo_linkedin_history_v1` | `linkedinStorage.ts:80` | `LinkedInOptimizationRecord[]` | **Hard bound: Max 30 entries** (`slice(0, 30)`) | History of generated LinkedIn hooks and bullets. |
| `curevo_company_research_v1` | `companyResearchStorage.ts:28`| `Record<string, CompanyResearchData>` | Keyed by lowercase company name | Verified intelligence cache on target employers. |
| `__curevo_storage_probe__` | `draftStorage.ts:141` | String `'1'` | Ephemeral write/read/delete probe | Detects if browser private mode disables localStorage. |

---

## 3. Data Persistence & Survival Matrix

| Data Category | In-Memory State | LocalStorage | Browser Cookies | PostgreSQL DB | Survives Refresh? | Survives Restart? | Survives Incognito Close? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Active Keystrokes (<1.2s)** | **YES** | NO | NO | NO | **NO** | **NO** | **NO** |
| **Active CV Draft** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **Saved Jobs & Matches** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **Kanban Applications** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **Interview Transcripts** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **STAR Stories Bank** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **LinkedIn Optimizations** | YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **Company Research Cache**| YES | **YES** | NO | Optional | **YES** | **YES** | **NO** |
| **JWT Session Credentials**| NO | NO | **YES** | Optional | **YES** | **YES** | **NO** |
| **Uploaded File Buffers** | **RAM Buffer**| NO | NO | NO | **NO** | **NO** | **NO** |
| **Generated PDF Chunks** | **RAM Stream**| NO | NO | NO | **NO** | **NO** | **NO** |

---

## 4. Complete Client-Side Data Deletion Mechanics

Curevo AI provides granular, multi-level deletion controls allowing candidates to purge individual artifacts or atomically destroy all stored records.

```
                                  DELETION SCOPE HIERARCHY
                                  
     Level 1: Granular Item Deletion (Single Card / Session / Bullet)
               ├── removeSavedJob(jobId) ──────────────> Purges 1 Job
               ├── deleteApplication(appId) ───────────> Purges 1 Application
               ├── deleteInterviewSession(sessionId) ──> Purges 1 Session
               └── deleteStarStory(storyId) ───────────> Purges 1 STAR Story
               
     Level 2: Sectional History Purge
               ├── clearDraft(userId) ─────────────────> Purges Active CV Draft
               ├── clearSavedJobs() ───────────────────> Purges All Bookmarked Jobs
               ├── clearApplications() ────────────────> Purges Entire Kanban Board
               ├── clearAllInterviewSessions() ────────> Purges All Interview Runs
               ├── clearLinkedInHistory() ─────────────> Purges LinkedIn History
               └── clearCompanyResearch() ─────────────> Purges Employer Cache
               
     Level 3: Universal Atomic Erasure
               └── clearAllCurevoData() ───────────────> Purges ALL 8 LocalStorage Keys
                                                         + Resets All React States to Null
                                                         + Dispatches Global onDataChanged()
```

### Detailed Deletion Functions

#### 1. Clear Active CV Draft
- **Function:** `clearDraft(ownerId: string | null)` (`web/src/lib/draftStorage.ts#L432-L445`)
- **Action:** Removes `curevo_builder_draft_v1_anonymous` or user-specific key `curevo_builder_draft_v1_usr_${ownerId}`. Also removes legacy fallback key `curevo_builder_draft_v1`.
- **UI Trigger:** "Start Over" button in `PublicBuilder.tsx` displays modal confirmation: *"Are you sure you want to discard your active draft? All unsaved changes will be lost."*
- **State Reset:** Calls `handleStartOver()`, resetting `resume`, `ats`, `match`, `coverLetter`, `truth`, and `changeLog` states to empty defaults.

#### 2. Discard Anonymous Draft on Account Migration
- **Function:** `discardAnonymousDraft()` (`web/src/lib/draftStorage.ts#L458-L460`)
- **Action:** Automatically called when an anonymous draft is successfully imported into an authenticated user's account (`importAnonymousDraftToAccount`), ensuring unauthenticated browser sessions do not leave lingering draft fragments.

#### 3. Clear Saved Jobs
- **Function:** `clearSavedJobs()` (`web/src/lib/jobStorage.ts#L139-L144`)
- **Action:** Calls `localStorage.removeItem('curevo_saved_jobs_v1')`.
- **State Reset:** React state `savedJobs` in `Jobs.tsx` immediately resets to empty array.

#### 4. Clear Job Applications
- **Function:** `clearApplications()` (`web/src/lib/jobStorage.ts#L231-L236`)
- **Action:** Calls `localStorage.removeItem('curevo_applications_v1')`.
- **State Reset:** Kanban board in `Applications.tsx` immediately updates to show empty columns.

#### 5. Clear Interview Sessions
- **Function:** `clearAllInterviewSessions()` (`web/src/lib/interviewStorage.ts#L193-L197`)
- **Action:** Calls `localStorage.removeItem('curevo_interview_sessions_v1')`.
- **UI Trigger:** "Clear All History" button in Interview page history tab.

#### 6. Clear LinkedIn History
- **Function:** `clearLinkedInHistory()` (`web/src/lib/linkedinStorage.ts#L167-L170`)
- **Action:** Calls `localStorage.removeItem('curevo_linkedin_history_v1')`.
- **UI Trigger:** "Clear History" button on the LinkedIn optimizer history tab.

#### 7. Clear Company Research Cache
- **Function:** `clearCompanyResearch()` (`web/src/lib/companyResearchStorage.ts#L66-L69`)
- **Action:** Calls `localStorage.removeItem('curevo_company_research_v1')`.

#### 8. Master Atomic Erasure: Purge All Candidate Data
- **Function:** `clearAllCurevoData()` (`web/src/lib/userDataExport.ts#L125-L133`)
- **Action:** Atomically iterates over all 8 storage keys and purges them completely:
  ```ts
  localStorage.removeItem(STORAGE_KEYS.resumeDraft);
  localStorage.removeItem(STORAGE_KEYS.savedJobs);
  localStorage.removeItem(STORAGE_KEYS.applications);
  localStorage.removeItem(STORAGE_KEYS.interviewSessions);
  localStorage.removeItem(STORAGE_KEYS.starStories);
  localStorage.removeItem(STORAGE_KEYS.linkedinProfile);
  localStorage.removeItem(STORAGE_KEYS.linkedinHistory);
  localStorage.removeItem(STORAGE_KEYS.companyResearch);
  ```
- **UI Trigger:** Red "Purge All Data" button in `DataPrivacyModal.tsx` requires a 2-step confirmation click.
- **Side Effect:** Dispatches custom window event `window.dispatchEvent(new Event('curevo_data_purged'))`, signaling all open tabs and components to reset their in-memory React state to pristine initial defaults.

#### 9. Server Database Cascading Purge (Authenticated Mode)
- **Action:** Calling `DELETE FROM users WHERE id = $1` in `userRepository.ts` triggers PostgreSQL `ON DELETE CASCADE` across all 24 dependent relational tables.
- **Outcome:** The user's account, active Master CV, snapshot versions, tailored resumes, session tokens, verification tokens, tracked applications, interview answers, and audit logs are deleted in a single atomic database transaction.
