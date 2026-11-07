# Curevo AI / EnhanceCV — Phase 9A
# Phased Implementation Roadmap: Evolution to a Persistent Career OS

**Document:** Implementation Roadmap  
**Target Milestone:** Transition from Stateless Builder to Full Career Operating System  
**Guiding Principle:** Strict Architectural Dependency Ordering — Identity & Persistence before Workflows; Reuse Hardened Engines; Zero Data Loss.

---

## 1. Roadmap Architecture & Phase Progression

```mermaid
graph TD
    Phase9B["Phase 9B:<br>Immediate Client Data Protection<br>(Browser Local Cache)"] ──> Phase9C["Phase 9C:<br>Database & Identity Foundation<br>(Supabase PostgreSQL & Auth)"]
    Phase9C ──> Phase9D["Phase 9D:<br>Durable Master CV & Versioned Tailoring<br>(Durable Resumes & Change History)"]
    Phase9D ──> Phase9E["Phase 9E:<br>Application Management & Workflow Kanban<br>(Jobs, Tracker, Cover Letters)"]
    Phase9E ──> Phase9F["Phase 9F:<br>Interactive Interview Preparation<br>(Mock Interviews, STAR, Feedback)"]
```

---

## 2. Phase-by-Phase Execution Specifications

### Phase 9B: Immediate Client Data Protection (Zero-Risk Stopgap)

* **Objective**: Stop immediate user data loss in the active builder experience without introducing server-side database dependencies or breaking existing stateless production stability.
* **Problem Solved**: Prevents accidental loss of candidate resume facts, job descriptions, and generated cover letters when a user refreshes or accidentally closes their browser tab.
* **Components to Reuse**:
  - `web/src/pages/PublicBuilder.tsx` (all current tabs, ATS visualizer, Truth Guard display, cover letter editor).
  - All existing `/api/public/*` endpoints.
* **Components to Change**:
  - `PublicBuilder.tsx`: Add auto-saving and restoring from browser `localStorage` (debounced at 500ms) with a clear "Reset / Clear Draft" action.
* **Database Schema Changes**: None.
* **API Changes**: None.
* **Security & Privacy**:
  - Sensitive candidate facts stored purely in the user's local browser origin.
  - No sensitive data transmitted to third parties.
* **Test Strategy**:
  - Vitest frontend tests for `localStorage` draft hydration and corruption recovery.
* **Acceptance Criteria**:
  - Uploading a CV, tailoring it, refreshing the browser, and seeing the tailored CV and ATS score restore instantaneously.
* **Rollback Strategy**:
  - Pure frontend feature flag / fallback to default in-memory state.

---

### Phase 9C: Database & Identity Foundation (Supabase & Authentication)

* **Objective**: Establish a secure, verified PostgreSQL database connection on Render, run baseline schema migrations, and re-mount hardened user registration and authentication.
* **Problem Solved**: Enables real user accounts, multi-device synchronization, and data ownership.
* **Components to Reuse**:
  - `server/src/db/db.ts` (connection pooling and health logic).
  - `server/src/routes/auth.ts` (bcrypt hashing, JWT cookies, token revocation).
  - `server/src/middleware/auth.ts` (`requireAuth` guard).
  - `web/src/pages/Login.tsx`, `Signup.tsx`, `AuthFlows.tsx`.
* **Components to Change**:
  - `server/src/app.ts`: Mount `/api/auth` router with rate limiting.
  - `server/src/db/db.ts`: Add structured migration execution and health checks on boot.
  - `web/src/App.tsx`: Mount `/login`, `/signup`, `/forgot-password` routes with proper redirection.
  - `web/src/state/AuthContext.tsx`: Re-activate `refresh()` to poll `/api/auth/me` on load.
* **Database Schema Changes**:
  - Initialize baseline tables: `users`, `user_sessions`, `email_verification_tokens`, `password_reset_tokens`.
  - Add PostgreSQL Row-Level Security (RLS) policies enforcing `user_id = auth.uid()`.
* **API Changes**:
  - Mount `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
* **Security Requirements**:
  - Enforce `SameSite=None; Secure; HttpOnly` cookies across Vercel and Render domains.
  - Minimum 32-character production `JWT_SECRET` verification.
  - Zero password or token leaks in logs or Sentry.
* **Test Strategy**:
  - Unit tests for password hashing, session issuance, and revocation.
  - Integration tests for cross-origin cookie authentication.
* **Acceptance Criteria**:
  - User can register, log in, refresh page, remain logged in, and log out cleanly.
* **Rollback Strategy**:
  - Unmount `/api/auth` in `app.ts` to return to stateless mode immediately.

---

### Phase 9D: Durable Master CV & Versioned Resume Tailoring

* **Objective**: Connect the resume builder to user accounts so candidates maintain a single canonical "Master CV" and a permanent, versioned history of job-tailored resumes.
* **Problem Solved**: Candidates no longer need to re-upload their resume for every job application.
* **Components to Reuse**:
  - `server/src/engine/ats.ts`, `engine/audit.ts`, `engine/tailor.ts`, `engine/pdf.ts`.
  - `server/src/ai/resumeAgent.ts` (NVIDIA Nemotron + Truth Guard).
  - `web/src/pages/MasterCV.tsx`, `ResumeEditor.tsx`.
* **Components to Change**:
  - `server/src/routes/master.ts` and `routes/resumes.ts`: Re-mount under `/api/master` and `/api/resumes`.
  - `PublicBuilder.tsx`: Add "Save to My Profile" button for authenticated users.
* **Database Schema Changes**:
  - Ensure `resumes` table (`kind IN ('master', 'tailored')`) and `tailoring_runs` table are active.
* **API Changes**:
  - Mount `GET /api/master`, `PUT /api/master`, `GET /api/resumes`, `POST /api/resumes/:id/tailor`.
* **Security Requirements**:
  - Strict tenant isolation: every query scoped by authenticated `user_id`.
  - Prevent user A from accessing or overwriting user B's resume records.
* **Test Strategy**:
  - Multi-tenant regression tests asserting 403/404 on cross-user record access.
  - Truth Guard verification on tailored versions stored in database.
* **Acceptance Criteria**:
  - Candidate logs in on Device A, saves Master CV; logs in on Device B and retrieves it.
  - Tailoring a resume creates a new versioned record without modifying the Master CV.
* **Rollback Strategy**:
  - Resumes can still be exported as PDF independently of database storage.

---

### Phase 9E: Application Management & Workflow Kanban (Jobs & Applications)

* **Objective**: Re-activate the job application tracker and saved jobs pipeline, linking tailored resumes and cover letters directly to job applications.
* **Problem Solved**: Replaces third-party spreadsheets and gives users a centralized career cockpit.
* **Components to Reuse**:
  - `server/src/routes/applications.ts` and `routes/jobs.ts`.
  - `web/src/pages/Applications.tsx` and `Jobs.tsx`.
  - Cover letter generation engine (`ai/coverLetterAgent.ts`).
* **Components to Change**:
  - `web/src/pages/Applications.tsx`: Modernize Kanban UI with Tailwind.
  - `server/src/app.ts`: Mount `/api/applications` and `/api/jobs`.
* **Database Schema Changes**:
  - Ensure `applications`, `application_events`, and `saved_jobs` tables are active.
* **API Changes**:
  - Mount `GET /api/applications`, `POST /api/applications`, `PATCH /api/applications/:id`.
* **Security Requirements**:
  - Foreign key integrity (`user_id`, `job_id`, `resume_id`).
* **Test Strategy**:
  - Vitest suite for application stage transitions (`SAVED` -> `APPLIED` -> `INTERVIEW` -> `OFFER`).
* **Acceptance Criteria**:
  - Candidate creates an application for "Software Engineer at Google", attaches tailored CV v2 and generated cover letter, and drags it across the status board.

---

### Phase 9F: Interactive Interview Preparation & Advanced Career OS Tools

* **Objective**: Re-activate the AI Interview Preparation and Mock Interview engine, grounding practice questions directly on candidate CV facts and target job requirements.
* **Problem Solved**: Candidates prepare for interviews with realistic, customized STAR questions rather than generic prompts.
* **Components to Reuse**:
  - `server/src/ai/interviewAgent.ts`.
  - `server/src/routes/interview.ts`.
  - `web/src/pages/Interview.tsx`.
* **Components to Change**:
  - `Interview.tsx`: Connect to live NVIDIA Nemotron interview session endpoints.
  - `server/src/app.ts`: Mount `/api/interview`.
* **Database Schema Changes**:
  - Ensure `interview_sessions`, `interview_questions`, and `interview_answers` tables are active.
* **API Changes**:
  - Mount `POST /api/interview/prepare`, `POST /api/interview/session`, `POST /api/interview/session/:id/answer`.
* **Security & Cost Control**:
  - Strict concurrency limits and token quotas per user to prevent API overuse.
* **Test Strategy**:
  - Synthetic simulation of interview answer evaluation and score generation.
* **Acceptance Criteria**:
  - Candidate generates 5 role-specific behavioral questions, submits a text answer, and receives constructive STAR feedback grounded on their CV.

---

## 3. Dependency & Risk Mitigation Matrix

| Milestone | Prerequisite | Risk | Mitigation |
|:---|:---|:---|:---|
| **Phase 9B** (Local Cache) | None | Storage quota exceeded (5MB limit) | Store only text/JSON; never store binary files in localStorage. |
| **Phase 9C** (Database & Auth) | Phase 9B | Cross-origin cookie blocking on Safari / iOS | Set `SameSite=None; Secure`; configure matching root domains if needed. |
| **Phase 9D** (Durable Resumes) | Phase 9C | Large resume JSON objects impacting PostgreSQL performance | Store resume contents as structured JSON text with GIN indexing. |
| **Phase 9E** (Applications) | Phase 9D | Orphaned foreign keys on deleted resumes | Use `ON DELETE SET NULL` for attached resumes on applications. |
| **Phase 9F** (Interview Prep) | Phase 9E | LLM latency and token timeouts during mock interviews | Stream responses or enforce 65s timeouts with adaptive retries. |

---

## 4. Next Step Recommendation

**Execute Phase 9B immediately upon user approval.**  
Phase 9B requires **zero database infrastructure changes**, **zero server-side modifications**, and provides **instant relief from data loss** for all active production users of Curevo AI.
