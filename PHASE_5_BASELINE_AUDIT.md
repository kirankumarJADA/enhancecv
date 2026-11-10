# CUREVO AI — PHASE 5 BASELINE AUDIT REPORT

**Repository:** `kirankumarJADA/enhancecv`  
**Frontend Production:** `https://enhancecv-orpin.vercel.app` (Release `794b5eb`)  
**Backend Production:** `https://curevo-ai.onrender.com` (Release `f8582db`)  
**Audit Date:** November 10, 2026  
**Auditor:** Principal AI Systems & Application Security Engineer  

---

## 1. GIT, COMMIT & PRODUCTION INTEGRITY

### 1.1 Repository State
- **Current Branch:** `main`
- **HEAD Commit:** `794b5eb08460a97de96bbb31f2a8549d118453b8` (`feat: improve builder privacy and job description guidance`)
- **Parent Commit:** `f8582db171b283d2a85a9a9ac331e23f0b7bae31` (`security: harden public APIs and enforce input boundaries`)
- **Working Tree:** Completely clean (`nothing to commit, working tree clean`)
- **Remote Synchronization:** `origin/main` matches `HEAD` (`Everything up-to-date` on `github.com/kirankumarJADA/enhancecv`)

### 1.2 Production Environments
- **Frontend (Vercel):** Serving production bundle `assets/index-CzUyucLk.js` (`x-vercel-id: lhr1::r65g6-1794316908216-bc003650d6b6`). Verified live via browser automation.
- **Backend (Render):** Serving `f8582db` on `https://curevo-ai.onrender.com`. Pinned to security release `f8582db` (since `794b5eb` only modified frontend files in `web/`, no backend redeployment was triggered). Backend health verified via `GET /api/health` (HTTP 200 OK).

---

## 2. FEATURE INVENTORY & ROUTE AUDIT

### 2.1 Public Stateless Backend Endpoints (`server/src/routes/public.ts`)
| Route | Method | Purpose & Guardrails | Tested & Verified |
| :--- | :---: | :--- | :---: |
| `/api/public/status` | GET | Reports AI provider, model, timeout (no secrets leaked) | **PASS** |
| `/api/public/parse` | POST | In-memory CV file upload (PDF/DOCX/TXT) -> ATS score | **PASS** |
| `/api/public/ats` | POST | Deterministic 22-check ATS audit & multi-dimensional scoring | **PASS** |
| `/api/public/match` | POST | Deterministic job description skill matching & gap analysis | **PASS** |
| `/api/public/improve` | POST | AI resume rebuilder + Truth Guard validation floor | **PASS** |
| `/api/public/create` | POST | AI resume generation from user facts | **PASS** |
| `/api/public/pdf` | POST | Streams PDF across 6 ATS-safe templates (Classic, Modern, Executive, Minimal, Compact, Technical) | **PASS** |
| `/api/public/cover-letter` | POST | 4-paragraph ResumeSkills cover letter generator | **PASS** |
| `/api/public/cover-letter/pdf` | POST | Streams ATS-safe cover letter PDF | **PASS** |
| `/api/public/interview/*` | POST | STAR question generation, answer evaluation & coaching | **PASS** |
| `/api/public/linkedin` | POST | LinkedIn headline, about, and experience optimizer | **PASS** |
| `/api/public/research` | POST | Sourced company research without hallucinations | **PASS** |
| `/api/public/jobs` | GET | Curated & live job search with client-side caching | **PASS** |

### 2.2 Frontend Public Routes (`web/src/App.tsx`)
- `/` — Enhancv UK-inspired landing page with 11 structural sections, interactive demo tabs, and privacy guarantees.
- `/builder` — Primary stateless builder workspace supporting 3 operational modes (`ats`, `improve`, `create`).
- `/ats`, `/check-ats` — Clean redirect to `/builder?mode=ats`.
- `/tailor` — Clean redirect to `/builder?mode=improve`.
- `/prepare-application` — Unified multi-step workflow combining CV tailoring, cover letter, and interview prep.
- `/jobs`, `/applications` — Client-side job search and application tracker (localStorage only).
- `/interview` — Public AI mock interview coach and STAR response bank.
- `/linkedin` — Public LinkedIn profile optimizer.
- Legacy auth paths (`/login`, `/signup`, `/app/*`) — Safely redirected to `/builder`.

---

## 3. AUTOMATED TEST SUITE STATUS

### 3.1 Backend Test Execution (`server/`)
- **Command:** `npx vitest run --pool=forks`
- **Results:**
  - **Test Files:** 30 passed / 30 total (**100%**)
  - **Tests Passed:** **421 passed**
  - **Tests Skipped:** **15 skipped** (deliberately skipped optional database integration tests when `DATABASE_URL` is omitted in stateless mode)
  - **Tests Failed:** **0 failed**
  - **Execution Time:** 37.48s

### 3.2 Frontend Test Execution (`web/`)
- **Command:** `npm test` (`vitest run`)
- **Results:**
  - **Test Files:** 15 passed / 15 total (**100%**)
  - **Tests Passed:** **178 passed** (includes all 18 Phase 4 UX polish regression tests)
  - **Tests Skipped:** **0 skipped**
  - **Tests Failed:** **0 failed**
  - **Execution Time:** 2.21s

### 3.3 TypeScript Typechecking
- **Frontend (`web/`):** `npx tsc --noEmit` passed with **0 errors**.
- **Backend (`server/`):**
  - Production build (`tsc -p tsconfig.build.json`): **0 errors**.
  - Root dev check (`tsc --noEmit` on root `tsconfig.json`): **1 typing warning** in test fixture (`server/tests/pdf_subtitle_layout.test.ts:23:7`: `TEST_RESUME_LONG_SUBTITLES` missing optional `sectionOrder` and `hiddenSections` keys). Does not impact compiled production code.

---

## 4. SECURITY, PRIVACY & TELEMETRY AUDIT

### 4.1 Existing Monitoring & Telemetry
- **Server Monitoring (`server/src/lib/monitoring.ts`):** `captureError()` logs sanitized error codes to `stderr`. Scrubbing removes passwords, tokens, API keys, and candidate data. Pluggable Sentry transport is completely unconfigured (`SENTRY_DSN` unset in production).
- **Client Monitoring (`web/src/lib/monitoring.ts`):** `captureWebError()` scrubs emails, bearer tokens, and candidate PII before console logging. Pluggable Sentry transport is unconfigured (`VITE_SENTRY_DSN` unset in production).
- **Product Telemetry:** **Zero tracking scripts, cookies, or product analytics exist.** The application currently transmits zero user activity events.

### 4.2 Accuracy of Privacy Disclosures
- **Dropzone Notice:** *"Processed in memory — CV files are not stored as server-side files. Your saved draft remains in your browser. You control your data."* -> **100% accurate.** Multer uses `memoryStorage()`; no file is ever written to server disk or database.
- **Data Privacy Modal:** Details that all drafts, applications, and sessions reside in browser `localStorage`, with one-click full JSON export, import, and permanent erasure -> **100% accurate.**
- **Truth Guard Disclosure:** Accurately clarifies that AI rewordings are grounded in verified source facts, and metric guesses without evidence are intercepted.

---

## 5. EXISTING DEFECTS & BETA READINESS GAPS

1. **Defect 1 (Low / Test Fixture Typing):** `server/tests/pdf_subtitle_layout.test.ts` line 23 mock object is missing `sectionOrder` and `hiddenSections` fields required by `ResumeData`.
2. **Beta Gap 1 (Feedback Collection Mechanism):** Currently, there is no in-app mechanism for beta users to submit structured feedback without leaving the application or sharing sensitive candidate data.
3. **Beta Gap 2 (Beta Participant Guidance):** The interface lacks explicit guidance indicating that the application is in controlled beta, which might cause first-time users to wonder how to report issues or what features are in active validation.

---
*Certified baseline audit complete.*
