# CUREVO AI — PHASE 5C: PUBLIC API MODEL DISCLOSURE AUDIT

**Target System**: Curevo AI Production API & Frontend Architecture  
**Release**: Frontend `794b5eb` | Backend `f8582db`  
**Date**: November 10, 2026

---

## 1. Executive Summary

This audit investigates the public exposure of internal model identifiers and provider architecture across Curevo AI's backend HTTP endpoints and client-side interfaces.

### Core Policy Requirement
- **Public-Facing Terminology**: The AI capability must be presented exclusively as **"AI Engine"**.
- **Information Protection**: No internal NVIDIA model identifiers (e.g., `nvidia/nemotron-3.5-lightning-30b-a3b`), gateway URLs (`integrate.api.nvidia.com`), or internal provider names must appear in public-facing UI or anonymous client payloads.
- **Diagnostic Preservation**: Internal server-side logging, error monitoring, and telemetry must continue capturing full diagnostics without degrading observability.
- **Contract Safety**: Fixes must not break existing frontend typing, state management, or deterministic fallbacks.

---

## 2. Full Inventory of Public Disclosure Points

### 2.1 Backend Endpoint Disclosures (`server/src/routes/public.ts`)

| Endpoint & HTTP Method | Field Exposed | Current Leaked Value | Exposure Severity |
| :--- | :--- | :--- | :--- |
| `GET /api/public/status` | `model` | `"nvidia/nemotron-3.5-lightning-30b-a3b"` | **HIGH** (Directly unauthenticated) |
| `GET /api/public/status` | `baseUrl` | `"https://integrate.api.nvidia.com/v1"` | **HIGH** (Exposes internal gateway) |
| `GET /api/public/status` | `provider` | `"nvidia"` | **MEDIUM** (Exposes provider brand) |
| `POST /api/public/cover-letter` | `model` | `"nvidia/nemotron-3.5-lightning-30b-a3b"` | **HIGH** (Returned in response body) |
| `POST /api/public/cover-letter` | `provider` | `"nvidia"` | **MEDIUM** (Returned in response body) |
| `POST /api/public/improve` | `agent.model` | `"nvidia/nemotron-3.5-lightning-30b-a3b"` | **HIGH** (Returned in response body) |
| `POST /api/public/improve` | `agent.provider`| `"nvidia"` | **MEDIUM** (Returned in response body) |
| `POST /api/public/interview-prep` | `ai.model` | `"nvidia/nemotron-3.5-lightning-30b-a3b"` | **HIGH** (Nested status return) |

---

### 2.2 Frontend UI Disclosures (`web/src/pages/`)

| File & Line | Component Context | Exposed Markup / Code | User-Facing Display |
| :--- | :--- | :--- | :--- |
| [`web/src/pages/ResumeEditor.tsx#L315`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/ResumeEditor.tsx#L315) | AI Review Button | `{aiBusy && <Spinner />} AI Review ({aiStatus.model})` | `AI Review (nvidia/nemotron-3.5-lightning-30b-a3b)` |
| [`web/src/pages/Tailor.tsx#L171`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/Tailor.tsx#L171) | Tailoring Progress | `<TailoringProgress ... model={aiStatus?.model} />` | Passes raw model ID to progress banner |
| [`web/src/pages/Tailor.tsx#L216`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/Tailor.tsx#L216) | Tailoring Result Banner | `{result.agent.usedAi ? `${result.agent.provider} • ${result.agent.model}` : ...}` | `nvidia • nvidia/nemotron-3.5-lightning-30b-a3b` |
| [`web/src/pages/LinkedIn.tsx#L185`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/LinkedIn.tsx#L185) | Storage metadata | `model: res.model \|\| 'Curevo Model'` | Saves raw model in local history |

---

## 3. Impact Assessment

1. **Brand Consistency**: Displaying raw vendor strings like `nvidia/nemotron-3.5-lightning-30b-a3b` detracts from Curevo AI's unified product branding and violates the non-negotiable policy that public-facing terminology remains "AI Engine".
2. **Reverse-Engineering & Scraping**: Anonymous API clients can probe `/api/public/status` to fingerprint backend model architectures, gateway configurations, and timeout limits.
3. **Vendor Decoupling**: If Curevo AI changes underlying models or routing gateways, public API contracts and UI buttons would display changing model strings unless abstractly masked as "AI Engine".

---

## 4. Proposed Minimal Fix (Zero Breaking Changes)

### 4.1 Server Implementation
Mask external-facing model and provider strings while keeping internal configuration and server logs fully detailed:

1. **`server/src/ai/provider.ts`**:
   In `getAiStatus()`:
   ```typescript
   export function getAiStatus(): { enabled: boolean; provider: string; model: string; maxIterations: number } {
     const p = getAiProvider();
     return {
       enabled: !(p instanceof RuleBasedProvider),
       provider: 'AI Engine',
       model: 'AI Engine',
       maxIterations: getAiMaxIterations(),
     };
   }
   ```
   *(Removes `baseUrl` and internal `timeoutMs` from public status).*

2. **`server/src/routes/public.ts`**:
   In `POST /api/public/cover-letter`:
   ```typescript
   res.json({
     letter: result.letter,
     targetRole: targetRole || undefined,
     company: company || undefined,
     rejectedCount: result.rejectedCount,
     warnings: result.warnings || [],
     provider: 'AI Engine',
     model: 'AI Engine',
     isFallback: Boolean(result.isFallback),
   });
   ```

   In `POST /api/public/improve`:
   ```typescript
   const publicAgentMeta = {
     ...meta,
     provider: 'AI Engine',
     model: 'AI Engine',
   };
   ```

3. **Server Diagnostics Preservation**:
   All internal execution logs in `server/src/ai/provider.ts` continue emitting exact diagnostics:
   ```typescript
   console.error(`ai name=${this.name} model=${this.model} attempt=${attempt} ok finish_reason=${finishReason}`);
   ```
   No developer visibility or error logging is sacrificed.

---

### 4.2 Client Implementation
Align UI text so user-facing labels remain clean even if older cached responses are received:

1. **`web/src/pages/ResumeEditor.tsx#L315`**:
   ```tsx
   <button className="btn-secondary w-full" onClick={() => void runAiCritique()} disabled={aiBusy}>
     {aiBusy && <Spinner className="h-4 w-4" />} AI Review (AI Engine)
   </button>
   ```

2. **`web/src/pages/Tailor.tsx#L216`**:
   ```tsx
   <span className="font-medium text-slate-700">
     {result.agent.usedAi ? 'AI Engine' : 'Deterministic engine only'}
   </span>
   ```

---

## 5. Affected Files Inventory
- [`server/src/ai/provider.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/ai/provider.ts)
- [`server/src/routes/public.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/server/src/routes/public.ts)
- [`web/src/pages/ResumeEditor.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/ResumeEditor.tsx)
- [`web/src/pages/Tailor.tsx`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/pages/Tailor.tsx)
- [`web/src/types.ts`](file:///C:/Users/jadak/.zcode/workspace/default/enhancecv/web/src/types.ts)
