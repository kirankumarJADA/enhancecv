# CUREVO AI — PHASE 5D REGRESSION REPORT
**Date**: November 10, 2026  
**Status**: 100% PASSING — ZERO REGRESSIONS  
**Branch**: `main` (Head: `794b5eb`)  
**Production Frontend**: Vercel `794b5eb` (`https://enhancecv-orpin.vercel.app`)  
**Production Backend**: Render `f8582db` (`https://curevo-ai.onrender.com`)  
**Git Safety**: Zero pushes made, zero commits created, zero production deployments triggered.

---

## 1. Test Suite Results Matrix

### Backend Regression Suite (`server`)
- **Test Command**: `vitest run`
- **Test Files**: **32 passed** / 32 total (100%)
- **Tests**: **439 passed** / 15 skipped / 454 total (0 failed)
- **Duration**: 20.24 seconds
- **Skip Explanation**: The 15 skipped tests reside in `cors.test.ts` (9 tests) and `app-url.test.ts` (2 tests) + optional remote web hooks, requiring live remote origin domain variables (`FRONTEND_URL` / remote production targets).

### Frontend Web Suite (`web`)
- **Test Command**: `vitest run --run`
- **Test Files**: **15 passed** / 15 total (100%)
- **Tests**: **178 passed** / 0 skipped / 178 total (0 failed)
- **Duration**: 2.43 seconds

### Full Compilation & Type Checking
- **Backend TypeScript Compiler** (`tsc -p tsconfig.build.json`): **0 errors** (Clean build)
- **Frontend TypeScript Compiler** (`tsc -p tsconfig.json --noEmit`): **0 errors** (Clean build)

### Production Bundling
- **Backend Build** (`npm run build`): **SUCCESS** (`tsc -p tsconfig.build.json`)
- **Frontend Build** (`npm run build`): **SUCCESS** (`vite build` $\rightarrow$ `dist/assets/index-D2_BJVG0.js` generated)

---

## 2. Git Working Tree Status

### Modified Files (12 files)
1. `server/src/engine/tailor.ts`: Context-aware duration/headcount parsing, regex expansion for metrics, Truth Guard hardening.
2. `server/src/ai/provider.ts`: `getAiStatus()` sanitized to `"AI Engine"`, stripped base URLs and timeouts.
3. `server/src/ai/coverLetterAgent.ts`: Metadata standardized to `"AI Engine"`.
4. `server/src/ai/resumeAgent.ts`: Metadata standardized to `"AI Engine"`.
5. `server/src/ai/createAgent.ts`: Metadata standardized to `"AI Engine"`.
6. `server/src/routes/public.ts`: Sanitized `/cover-letter` and public routes.
7. `server/tests/pdf_subtitle_layout.test.ts`: Added missing `ResumeData` fields (`summary`, `interests`) to prevent schema failure.
8. `server/tests/ai_tailoring_e2e.test.ts`: Updated test assertions to expect `"AI Engine"`.
9. `server/tests/cover_letter_integration.test.ts`: Updated test assertions to expect `"AI Engine"`.
10. `server/tests/public.test.ts`: Updated test assertions to expect `"AI Engine"`.
11. `web/src/pages/ResumeEditor.tsx`: Replaced dynamic model interpolation with `AI Review (AI Engine)`.
12. `web/src/pages/Tailor.tsx`: Replaced model interpolation with `AI Engine tailoring your CV…` and static `'AI Engine'` badge.

### Untracked Files (New Assets & Audit Documentation)
- `server/tests/truthGuard_adversarial_hardening.test.ts` (13 adversarial tests)
- `server/tests/public_disclosure_safety.test.ts` (5 public API disclosure tests)
- `PHASE_5_BASELINE_AUDIT.md`
- `PHASE_5_BETA_VALIDATION_PLAN.md`
- `PHASE_5_FINDINGS_AND_PRIORITIES.md`
- `PHASE_5_PRIVACY_AND_MEASUREMENT_REVIEW.md`
- `PHASE_5_VERIFICATION_REPORT.md`
- `PHASE_5C_TRUTH_GUARD_AUDIT.md`
- `PHASE_5C_PUBLIC_API_DISCLOSURE_AUDIT.md`
- `PHASE_5C_VERIFICATION_REPORT.md`
- `PHASE_5D_TRUTH_GUARD_FIX_REPORT.md`
- `PHASE_5D_AI_ENGINE_DISCLOSURE_REPORT.md`
- `PHASE_5D_REGRESSION_REPORT.md`
- `docs/BETA_LAUNCH_KIT.md`

---

## 3. Product Principles & Production Constraints Verification

| Rule / Principle | Verification Status |
|:---|:---|
| 1. Public, anonymous & free | Preserved. No auth gate added. |
| 2. No mandatory registration / payment | Preserved. No payment provider added. |
| 3. No database dependency (Supabase/PostgreSQL) | Preserved. Backend remains strictly stateless. |
| 4. Browser-local storage draft persistence | Preserved. All 8 draft/interview/job storage tests pass. |
| 5. Zero hallucination / Truth Guard active | Hardened. 12-year vulnerability eradicated; headcount and metrics bounded. |
| 6. Public AI Engine branding | Enforced. Internal model IDs eradicated across API & UI. |
| 7. Production deployment state | Intact. Branch unchanged; zero commits or pushes made. |
| 8. Credential safety | No credentials or secrets requested, exposed, or written. |
