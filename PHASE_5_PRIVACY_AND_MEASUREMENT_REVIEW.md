# CUREVO AI — PHASE 5 PRIVACY-FIRST MEASUREMENT DESIGN & REVIEW

**Platform:** Curevo AI (`kirankumarJADA/enhancecv`)  
**Architecture:** Stateless In-Memory Backend + LocalStorage Frontend  
**Audit Date:** November 10, 2026  
**Auditor:** Principal AI Systems & Application Security Engineer  

---

## 1. PRIVACY ARCHITECTURE REVIEW & CURRENT STATE

Curevo AI is built on a strict privacy-first foundation:
- **No Mandatory Accounts / No Database:** The platform operates without user authentication, registration cookies, or remote relational databases.
- **In-Memory File Processing:** Uploaded CV files (PDF, DOCX, TXT) are processed exclusively in RAM (`multer.memoryStorage()`) and discarded immediately after parsing. No temporary or persistent files are saved to server disk.
- **Client-Side Draft Sovereignty:** User work is persisted exclusively in the candidate's browser `localStorage` using versioned keys (`curevo_anonymous_draft_v2`, `curevo_applications_v1`).
- **Zero Third-Party Trackers:** There are no Google Analytics, Meta Pixel, Hotjar, or advertising SDKs included in the web bundle.

---

## 2. MEASUREMENT FEASIBILITY ASSESSMENT

### 2.1 The Core Dilemma
In a typical SaaS product, telemetry is collected automatically to evaluate funnel drop-offs (e.g., upload -> ATS -> tailor -> download). However, for an anonymous career application handling sensitive personal CVs, commercial telemetry poses significant privacy and compliance risks (GDPR, UK Data Protection Act 2018):
- User IP addresses can constitute personal data under GDPR.
- URL parameters, referrers, and payload metadata can inadvertently leak names, employers, or locations.
- Introducing third-party telemetry providers requires cookie banners, cross-border data transfer disclosures, and consent management.

### 2.2 Finding: Telemetry Necessity vs. Beta Objectives
For a controlled 15-user beta, automated server-side or third-party telemetry is **unnecessary and introduces privacy risks without proportional benefit**:
1. **Direct High-Fidelity Feedback:** A 15-user cohort provides qualitative and quantitative evaluation through the structured questionnaire (`PHASE_5_BETA_VALIDATION_PLAN.md`), which captures user perception, failure modes, and layout feedback directly.
2. **Existing Telemetry is Sufficient for Stability:** Curevo AI already implements sanitized error capture (`captureError()` on the server and `captureWebError()` on the web), which scrubs all PII and logs runtime exceptions without storing user data.
3. **Architecture Preservation:** Adding remote event-logging endpoints or third-party analytics would contradict Non-Negotiable Rule 1 ("anonymous, public and free") and Rule 4 ("preserve the stateless public backend architecture").

---

## 3. MINIMAL ANONYMOUS EVENT SCHEMA SPECIFICATION (REFERENCE ONLY)

If product management requires aggregate usage metrics for future public scaling beyond the controlled beta, the implementation must adhere to this minimal, zero-PII event schema:

### 3.1 Permissible Aggregate Events
- `builder_opened`: Builder page view initialized (mode: `ats` | `improve` | `create`).
- `cv_upload_started`: File dropped/selected into memory.
- `cv_parse_succeeded`: Document text successfully extracted.
- `ats_analysis_completed`: ATS score computed.
- `resume_improvement_completed`: AI tailoring proposal merged.
- `truth_guard_warning_shown`: Unsupported claim intercepted.
- `cover_letter_completed`: Cover letter generated.
- `pdf_export_completed`: PDF blob compiled (template: `classic` | `modern` | `executive` | etc.).
- `draft_restored`: Saved draft restored from `localStorage`.
- `backup_exported`: JSON backup downloaded.
- `backup_imported`: JSON backup restored.

### 3.2 Strict Data Payload Restrictions
Every event payload must be strictly limited to categorical enums and operational durations:

```json
// Example: Permissible Payload (Zero PII)
{
  "event": "resume_improvement_completed",
  "timestamp": "2026-11-10T13:30:00Z",
  "data": {
    "durationMs": 4250,
    "claimsSanitized": 1,
    "template": "classic"
  }
}
```

### 3.3 Absolute Prohibitions (Never Collected or Transmitted)
- **No CV Content:** Never transmit names, addresses, emails, phone numbers, job titles, employer names, or bullet texts.
- **No Filenames:** Never transmit original file names (e.g. `John_Doe_Google_Resume.pdf`).
- **No Job Description Text:** Never transmit employer names, JD text, or search queries.
- **No AI Prompts / Responses:** Never transmit full prompt context or model output strings.
- **No Cross-Session Tracking:** No persistent UUIDs, cookies, or fingerprinting techniques (Canvas/WebGL/Audio).
- **No IP Storage:** IP addresses must be truncated/anonymized at network ingress and never persisted in event logs.

---

## 4. LOCALSTORAGE-ONLY SESSION METRICS (SAFEST ALTERNATIVE)

To monitor user session health without transmitting any network telemetry, metrics can be calculated and stored **entirely within the user's browser `localStorage`**:
- A local telemetry ledger (`curevo_session_metrics_v1`) tracks local task completions (e.g., `uploadsCount: 1`, `tailoredCount: 1`, `pdfsExported: 2`).
- Users can view their own session metrics directly in the **Data Privacy & Backup** modal.
- If a user encounters an issue during beta, they can optionally export this diagnostic JSON alongside their backup to share with the engineering team.
- **Privacy Guarantee:** Zero bytes leave the user's computer unless explicitly exported and shared by the user.

---

## 5. RECOMMENDATION & VERDICT

**RECOMMENDATION FOR PHASE 5 BETA:**  
**DO NOT DEPLOY REMOTE TELEMETRY.**  
The controlled 15-user beta should be conducted using the structured, anonymous questionnaire. Operating without telemetry maintains Curevo AI's strict zero-database, zero-tracking privacy guarantee and ensures 100% compliance with non-negotiable architectural constraints.

---
*Certified privacy-first measurement review complete.*
