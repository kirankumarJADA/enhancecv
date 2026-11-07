# Phase 7 — Production Release Report

**Release:** security remediation `fe131100597315d36f5623e98e8810750ae114e1` — `fix(security): remediate body-parser, qs, vite, and source-map-js vulnerabilities in lockfiles`
**Date:** 2026-11-03/04 · **Executed from:** `C:\Users\jadak\.zcode\workspace\default\enhancecv`

---

## A. Git status

| Item | Value |
|---|---|
| Original HEAD (local) | `fe131100597315d36f5623e98e8810750ae114e1` (branch `main`, ahead 1 of `origin/main`) |
| Previous `origin/main` | `4db96c2` |
| Published commit | `fe131100597315d36f5623e98e8810750ae114e1` (fast-forward push `4db96c2..fe13110`, no amend/force) |
| Remote branch | `main` @ `https://github.com/kirankumarJADA/enhancecv` |
| Commit contents | `server/package-lock.json`, `web/package-lock.json` only — 2 files, 21+/21−; **no source files, no dependency-range changes** |
| Files deliberately excluded | 19 untracked QA/inspection scripts under `server/tests/` (preserved untouched) and the pre-existing untracked `QA_REPORT.md` |
| Final working tree | Clean of tracked modifications; only the same 19 untracked files + `QA_REPORT.md` remain, untouched |

Server lockfile bumps: `body-parser 1.20.8→1.20.9`, `qs 6.16.0→6.16.2`, `source-map-js 1.2.1→1.2.2`, `vite 7.3.6→7.3.7`.
Web lockfile bumps: `postcss-selector-parser 6.1.4→6.1.5`, `source-map-js 1.2.1→1.2.2`, `vite 6.4.3→6.4.5`.
Installed versions verified with `npm ls` in both workspaces; direct dependency ranges unchanged.

## B. Pre-release verification

| Check | Result |
|---|---|
| Backend Vitest (21 files) | **355 passed, 15 skipped, 0 failures** — matches the reported baseline exactly |
| Backend typecheck / build | PASS / PASS |
| Frontend Vitest (6 files) | **98 passed, 0 failures** — matches baseline |
| Frontend typecheck / build | PASS / PASS |
| Server audit (`--omit=dev`) | **Only the documented residual**: `zod@3.25.76` — GHSA-mrhx-c7xc-m3w5 (high, <4.6.6). Left in place per release scope (zod v4 is breaking; active HTTP bodies do not reach Zod — bounded NVIDIA model output only) |
| Server audit (full) | 4 dev-chain findings: `tinypool` (critical), `@vitest/mocker` (moderate), `zod` (high) + 1 related — all require breaking major upgrades (vitest 5 / zod 4), all dev-only (excluded from production install) |
| Web audit (`--omit=dev`) | **2 moderate `react-router` findings** (GHSA-wrjc-x8rr-h8h6 open redirect via backslash in `<Link>`/`useNavigate`; GHSA-337j-9hxr-rhxg `deserializeErrors()` SSR-hydration injection). Fix = `react-router-dom@7.18.5` (breaking) — **out of scope for this lockfile-only release; documented for the next phase** |
| Web audit (full) | 5 findings (3 moderate, 2 critical) — dev-only vitest/tinypool chain + the react-router pair above |

## C. Render deployment

| Item | Result |
|---|---|
| Service | `https://curevo-ai.onrender.com` — **healthy** |
| `GET /api/health` | HTTP 200 — `{"ok":true,"service":"curevo-ai",...}` |
| `GET /api/public/status` | HTTP 200 — `{"enabled":true,"provider":"nvidia","model":"nvidia/nemotron-3.5-lightning-30b-a3b","maxIterations":2,...}` (unchanged, as required) |
| Deployed commit SHA | **Not verifiable from this environment** — no Render dashboard/API credentials. No GitHub deployment record is created by this Render service (checked via GitHub API), and no service restart was observed 8+ minutes after the push. Historical pattern for this project: Render deploys require a **manual dashboard action**. The service is running and correct; the SHA confirmation must be done in the Render dashboard (or by providing a Render API key). |
| Behavioural note | The release is lockfile-only — pre- and post-deploy behaviour is identical, so all acceptance evidence below is representative of the released code. |

## D. Vercel deployment

| Item | Result |
|---|---|
| Deployment | Automatic — GitHub deployment record `7533710598`, environment **Production**, created `2026-11-03T23:45:50Z` by `vercel[bot]` for `fe13110` |
| Status | **success** (`Vercel | success` commit status; dashboard: `https://vercel.com/kirankumarjadas-projects/enhancecv/Azc9erNMfrSQhXkBgiUo4UHkGfWZ`) |
| Production URL | `https://enhancecv-orpin.vercel.app` — HTTP 200; SPA deep route (`/app`, `/builder?mode=ats`) HTTP 200 |
| Backend connectivity | CORS preflight 204 with `access-control-allow-origin: https://enhancecv-orpin.vercel.app`; `/api/public/status` 200 with ACAO from browser origin |

## E. Production acceptance (browser + API, synthetic data only)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Application availability | **PASS** | Landing (`/`) renders fully; `/builder?mode=ats` renders the 9-dimension ATS workflow; **0 console errors**, no blank screens; API connectivity verified |
| 2 | ATS analysis | **PASS** | Sample CV audited: **98/100**, "9 ATS Dimensions Audited / 22 Checks Evaluated", weighted breakdown visible (Parsing 100, Quantified 100, Repetition 100, Spelling 100, …), quick-wins list rendered; deterministic and consistent across reads |
| 3 | AI resume tailoring | **PASS** | Real NVIDIA call (~100–115 s incl. iterations): completed with **"Truth Guard: Grounding Verified (8/8 supported)"**, Job Match **82%** with explainable 7-dimension breakdown, **AI Changes (11)** recorded; ATS score remained deterministic (98) |
| 4 | Truth Guard | **PASS** | Injection JD ("ignore previous instructions… quantum computing… SOC2 Type II… 12 years Rust… 99.99% trading mesh") → **resume contains zero fabricated claims** (quantum/SOC2/Rust absent from preview and exported PDF); audit log shows per-claim verification (8/8 SUPPORTED, each traced to its CV section); backend engine attack suite (in the 355) additionally proves rejection/revert of unsupported claims |
| 5 | Resume PDF export | **PASS** | Generated PDF captured and validated: `%PDF-`, **2 pages**, 3,230 extractable chars, name/role/email/experience/skills all present, no watermark, no fabricated claims, text fully selectable |
| 6 | Cover letter | **PASS** | NVIDIA-generated ("Engine: nvidia", "✓ Truth Guard Grounded"), 3-paragraph structure; exported PDF: `%PDF-`, 1 page A4, 2,405 chars, grounded claims only (Java/Spring Boot/AWS present; quantum/SOC2 absent) |
| 7 | Audit & changes UI | **PASS** | "Truth Guard™ Audit Log" lists every rewritten claim with section + verdict; "AI Changes" shows an NVIDIA Nemotron transformation log with before/after and the rationale "using only facts already in your Master CV"; no fabricated verification displayed |
| 8 | Reliability & errors | **PASS (1 P3 note)** | 0 console errors, 0 network 5xx across the full journey (2 AI calls, 2 PDF exports, all endpoints); oversized upload → **413 FILE_TOO_LARGE (8 MB limit)**; malformed JSON → HTTP 500 but **fully sanitised body** (`INTERNAL`, requestId, no stack) — P3: should be 400 (pre-existing, not introduced by this release); unauthenticated probes → 404 (anti-enumeration convention) |

## F. Security status

**Fixed by this release:** `body-parser` 1.20.9, `qs` 6.16.2, `source-map-js` 1.2.2, `vite` 7.3.7 (server) / `postcss-selector-parser` 6.1.5, `source-map-js` 1.2.2, `vite` 6.4.5 (web) — all confirmed installed.

**Remaining, documented:**
1. `zod@3.25.76` — GHSA-mrhx-c7xc-m3w5 (high, <4.6.6). Residual-risk basis: Zod parses only bounded NVIDIA model output (≈4,000–4,500-token cap); public request bodies do not reach Zod. Fix requires breaking zod v4 migration. **Not fixed in this release; still open.**
2. `react-router` 6.x (web, production dep) — 2 moderate advisories (open redirect via backslash; SSR `deserializeErrors` injection). The SPA does not use SSR error deserialisation; fix = `react-router-dom@7.18.5` breaking upgrade. **New finding vs the pre-release audit; scheduled for the next dependency phase.**
3. Dev-only chains (`tinypool` critical, `@vitest/mocker` moderate, vitest 3→5) — never installed in production; require breaking test-framework upgrades.

**Operational:** 8 MB upload limit enforced (413 verified); unauthenticated access denied (404 anti-enumeration); CORS allow-list intact; error responses sanitised (no stacks); AI provider/model unchanged; 500 error bodies carry only `INTERNAL` + requestId.

## G. Outstanding work

**Blockers / requires owner action:**
1. **Render deployed-SHA confirmation** — the service is healthy, but confirming the running build is `fe13110` needs one manual action: Render dashboard → `curevo-ai` → verify the active deploy is commit `fe13110` ("Manual Deploy → Deploy latest commit" if auto-deploy is off — this project has required manual deploys before).

**Scheduled (non-blocking):**
2. `react-router-dom` 7.18.5 upgrade (2 moderate production advisories) — breaking; next dependency phase.
3. Malformed-JSON requests should return 400, not 500 (sanitised today; body-parser error mapping).
4. `zod` v4 migration + dev-chain (`vitest` 5) upgrades — breaking; plan separately.
5. The 19 untracked QA scripts under `server/tests/` remain deliberately uncommitted — fold the useful ones into the suite or archive them.

## H. Final verdict

**DEPLOYED WITH LIMITATIONS** — the approved commit is published to GitHub and deployed to Vercel (both verified); all eight production acceptance checks passed against the live product; every pre-release gate matched its baseline. The single limitation is that Render's running-build SHA could not be confirmed from this environment (no credentials; no observable restart) — the service is healthy and behaviourally identical either way, since the release changes only lockfiles. One manual Render dashboard confirmation closes that gap.
