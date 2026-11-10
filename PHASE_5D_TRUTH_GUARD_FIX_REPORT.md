# CUREVO AI — PHASE 5D TRUTH GUARD HARDENING REPORT
**Date**: November 10, 2026  
**Status**: VERIFIED & COMPLETE  
**Target Engine**: `server/src/engine/tailor.ts`  
**Test Suite**: `server/tests/truthGuard_adversarial_hardening.test.ts` (13/13 passing)

---

## 1. Executive Summary

During the Phase 5C adversarial audit, a critical vulnerability in Curevo AI's Truth Guard was discovered: an adversarial payload claiming **"12 years of engineering leadership"** was accepted against a candidate whose Master CV only substantiated **5 years** of professional experience (and a chronological career span of 2021–Present).

In Phase 5D, we conducted root cause analysis, redesigned numerical and context evaluation within `server/src/engine/tailor.ts`, implemented context-aware duration and headcount verification, and added comprehensive adversarial regression tests. Truth Guard now rejects fabricated experience durations and inflated team sizes while strictly permitting truthful technical versions (e.g. Python 3, Java 17) and substantiated accomplishments.

---

## 2. Root Cause Analysis

### Vulnerability Mechanics
In the previous implementation of `isBulletTruthful()`:
1. **Context Stripping**: Numbers were extracted using a global regex:
   ```ts
   const numbers = (bullet.match(/\d+(?:[.,]\d+)?%?/g) || [])...
   ```
   This regex extracted the digits `"12"` without any semantic association with `"years"` or `"experience"`.
2. **Small Integer Exemption**:
   To avoid rejecting harmless counts (such as "3 features", "2 sprint cycles", or "4 bug fixes"), the validator had a blanket exemption:
   ```ts
   if (/^\d{1,2}$/.test(raw)) continue;
   ```
3. **The Exploit**:
   Because `"12"` is a 1- or 2-digit integer, it matched `/^\d{1,2}$/` and was discarded from the `unsupported` list. Consequently, `isBulletTruthful()` returned `{ ok: true, unsupported: [] }` even though the candidate only had 5 years of experience.

---

## 3. Engineering Fix Implementation

We implemented a context-aware semantic validation layer in `server/src/engine/tailor.ts`:

### A. Context-Aware Experience Duration Parsing
- **`getSupportedExperienceYears(master: ResumeData)`**:
  - Scans all text fields in the Master CV (`summary`, `experience`, `projects`, `achievements`) for explicit stated durations matching `/\b(\d+(?:\.\d+)?)\+?\s*(?:-|\s+)?(?:years?|yrs?)\b/gi`.
  - Analyzes chronological dates across all experience entries (`startDate`, `endDate`, `dateDisplay`, and raw dates).
  - Calculates the total chronological span: $\text{derivedYears} = \text{latestEnd} - \text{earliestStart}$, defaulting `current` or `"Present"` roles to the active calendar year.
  - Returns `{ maxYears, hasEvidence }`.
- **`checkExperienceDuration(text: string, master: ResumeData)`**:
  - Scans candidate text for duration claims (e.g., `"12 years"`, `"5+ yrs"`, `"decade of"`).
  - If the candidate CV has no verifiable dates or stated years, duration claims are flagged as unsupported.
  - If a duration claim exceeds `maxYears`, it is immediately flagged in `unsupported: ["12 years", ...]`.

### B. Leadership & Headcount Verification
- **`getSupportedHeadcount(master: ResumeData)`**:
  - Parses team size evidence from the Master CV (e.g. `"team of 5"`, `"led 8 engineers"`, `"12 direct reports"`).
  - Derives maximum verified leadership scale.
- **`checkHeadcountClaims(text: string, master: ResumeData)`**:
  - Detects phantom team sizes (e.g., `"managed team of 45 engineers"`) when the Master CV only substantiates a team of 5 or has zero management history.

### C. Financial & Metric Scaling Hardening
- **`masterNumbers(master: ResumeData)`**:
  - Updated regex to capture currency symbols and magnitude scales:
    ```ts
    /(?:[\$€£¥]\s*)?\d+(?:[.,]\d+)?(?:\s*[kKmMbBtT%])?/g
    ```
  - Prevents fabricated metrics like `"$5.8M"` or `"99.999%"` from being accepted merely because a different plain number existed in the CV.

### D. Safe Small Integer Exemption
- Small integers (`/^\d{1,2}$/`) are still permitted for general counts **only if** they are not part of an unsupported duration or headcount claim.
- Technical numbers such as `"Python 3"`, `"Java 17"`, and `"top 5%"` continue to pass seamlessly when grounded.

---

## 4. Verification & Adversarial Test Evidence

The dedicated regression test suite `server/tests/truthGuard_adversarial_hardening.test.ts` was created and executed:

| Test Case | Master CV Context | Generated Claim | Expected Result | Actual Result | Status |
|:---|:---|:---|:---|:---|:---|
| 1. Fabricated 12-Year Experience | 5 years stated (2021–Present) | "12 years of software engineering leadership" | REJECT (`12 years`) | REJECTED | PASS |
| 2. Truthful 5-Year Experience | 5 years stated (2021–Present) | "5 years of TypeScript development experience" | PASS (`ok: true`) | ACCEPTED | PASS |
| 3. Conservative Stated Span | 5 years stated (2021–Present) | "3+ years of building backend microservices" | PASS (`ok: true`) | ACCEPTED | PASS |
| 4. Chronology-Derived Span | 2020 to 2024 dates (no stated text) | "Over 4 years of TypeScript development experience" | PASS (`ok: true`) | ACCEPTED | PASS |
| 5. Unsubstantiated Chronology | No dates or stated years in CV | "Over 3 years of software engineering experience" | REJECT (No dates) | REJECTED | PASS |
| 6. Inflated Financial Metric | "$1.2M budget" in CV | "Managed $5.8M budget across department" | REJECT (`$5.8M`) | REJECTED | PASS |
| 7. Inflated Reliability/SLA | "99.9% uptime" in CV | "Maintained 99.999% uptime for core API" | REJECT (`99.999%`) | REJECTED | PASS |
| 8. Phantom Headcount | "team of 5 engineers" in CV | "Led high-performing team of 45 engineers" | REJECT (`45 engineers`) | REJECTED | PASS |
| 9. Unearned Credential | B.S. in Computer Science | "AWS Certified Solutions Architect & Ph.D." | REJECT (Cert/Degree) | REJECTED | PASS |
| 10. Unsupported Technology | Node.js, TypeScript in CV | "Engineered high-throughput Rust services" | REJECT (`Rust`) | REJECTED | PASS |
| 11. Truthful Grounded Bullet | "10M requests, Python 3, Java 17" | "Optimized Python 3 & Java 17 pipeline (10M requests)" | PASS (`ok: true`) | ACCEPTED | PASS |
| 12. Resume Rebuilding Auto-Revert | 5-year CV + AI hallucination | AI emits "12 years of engineering leadership" | Reverts to original bullet | REVERTED | PASS |
| 13. Cover Letter Sentence Pruner | 5-year CV + AI hallucination | AI emits "With over 12 years of leadership..." | Prunes sentence safely | PRUNED | PASS |

**Result**: 13/13 passing tests. 100% detection rate of adversarial experience and metric inflations.
