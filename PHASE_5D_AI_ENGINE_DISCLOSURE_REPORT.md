# CUREVO AI — PHASE 5D AI ENGINE DISCLOSURE REPORT
**Date**: November 10, 2026  
**Status**: VERIFIED & COMPLETE  
**Public Brand Standard**: `"AI Engine"`  
**Test Suite**: `server/tests/public_disclosure_safety.test.ts` (5/5 passing)

---

## 1. Executive Summary

Curevo AI product guidelines strictly require that public-facing model terminology remains **"AI Engine"** and that internal model IDs (e.g. `nvidia/nemotron-3.5-lightning-30b-a3b`), gateway URLs (`integrate.api.nvidia.com`), vendor names (`nvidia`), and internal configuration timeouts are never exposed to public clients.

In Phase 5D, we audited all public HTTP routes, agent responses, error handlers, and client UI components. All disclosures have been eliminated in both server response payloads and web UI displays. An automated disclosure safety test suite verifies that serialized JSON from public endpoints contains zero forbidden tokens.

---

## 2. Comprehensive Inventory of Changes

### A. Backend Provider & Status Route (`server/src/ai/provider.ts`)
- **Previous behavior**: `getAiStatus()` returned:
  ```json
  {
    "enabled": true,
    "provider": "nvidia",
    "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "baseUrl": "https://integrate.api.nvidia.com/v1",
    "timeoutMs": 45000
  }
  ```
- **Remediated behavior**:
  ```ts
  export function getAiStatus(): { enabled: boolean; provider: string; model: string; baseUrl: string; timeoutMs: number } {
    const isReal = isRealAiEnabled();
    return {
      enabled: isReal,
      provider: isReal ? 'AI Engine' : 'deterministic',
      model: isReal ? 'AI Engine' : 'rules-v1',
      baseUrl: '',
      timeoutMs: 0,
    };
  }
  ```
- **Security Impact**: Gateway base URL and timeout are stripped (`""` and `0`); vendor and model strings are unified to `"AI Engine"`.

### B. Cover Letter Generator & Public Route (`server/src/ai/coverLetterAgent.ts` & `server/src/routes/public.ts`)
- **`coverLetterAgent.ts`**: Returns `provider: 'AI Engine'`, `model: 'AI Engine'` (or `'deterministic'` / `'resumeskills-rules'` on fallback).
- **`routes/public.ts`** (`POST /api/public/cover-letter`): Sanitizes response metadata:
  ```ts
  provider: result.isFallback ? 'deterministic' : 'AI Engine',
  model: result.isFallback ? 'rules-v1' : 'AI Engine',
  ```

### C. Resume Improvement Agent (`server/src/ai/resumeAgent.ts`)
- Returns `meta.provider`: `aiEnabled ? 'AI Engine' : 'deterministic'`, `meta.model`: `aiEnabled ? 'AI Engine' : 'rules-v1'`.

### D. Resume Creation Agent (`server/src/ai/createAgent.ts`)
- Returns `agent.provider: 'AI Engine'`, `agent.model: 'AI Engine'`.

### E. Frontend Web Components (`web/src/pages/`)
1. **`ResumeEditor.tsx` (Line 315)**:
   - Replaced dynamic string `AI Review ({aiStatus.model})` with clean, branded string `AI Review (AI Engine)`.
2. **`Tailor.tsx` (Line 51 & Line 216)**:
   - Loading headline changed to `AI Engine tailoring your CV…`.
   - Results badge changed from `${result.agent.provider} · ${result.agent.model}` to direct, clean badge `'AI Engine'`.
   - Removed unused `provider` and `model` props from `TailoringProgress` component.

---

## 3. Automated Disclosure Safety Test Verification

A dedicated security regression test suite `server/tests/public_disclosure_safety.test.ts` was implemented to inspect actual wire JSON payloads across the public API surface.

### Forbidden Token List Verified
- `"nvidia"`
- `"nemotron"`
- `"integrate.api.nvidia.com"`
- `"gpt-4o"`
- `"deepseek"`
- `"mistral"`

### Test Results

| Test Scenario | Endpoint / Flow | Assertion | Result |
|:---|:---|:---|:---|
| 1. AI Status Endpoint | `GET /api/public/status` | Serialized JSON contains `"AI Engine"`, zero forbidden vendor tokens, empty baseUrl, 0 timeoutMs. | PASS |
| 2. Cover Letter Endpoint | `POST /api/public/cover-letter` | Wire JSON response contains `provider: "AI Engine"`, `model: "AI Engine"`, zero forbidden strings. | PASS |
| 3. Resume Improvement | `POST /api/public/improve` | Serialized output contains `meta.provider: "AI Engine"`, zero internal gateway or model strings. | PASS |
| 4. Error Responses | `POST /api/public/improve` (bad input) | Serialized error responses do not leak internal provider or stack details. | PASS |
| 5. Fallback Responses | `POST /api/public/cover-letter` (fallback) | Returns `deterministic` / `rules-v1` without vendor leakage. | PASS |

**Result**: 5/5 passing tests. Zero leakage across all serialized JSON responses.
