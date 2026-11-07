# Curevo AI Job Capture (Browser Extension) — Phase 9N

A privacy-first Manifest V3 Chrome/Edge extension that captures job postings from any web page and imports them directly into Curevo AI.

**100% Free, Public & Anonymous. Zero login or signup required.**

---

## Features

1. **Automatic Visible Page Extraction**:
   - Detects structured JSON-LD `JobPosting` schema.
   - Fallback to common job board selectors (LinkedIn Jobs, Indeed, Reed, Greenhouse, Lever, Workday).
   - Fallback to OpenGraph and meta descriptions.
   - Never bypasses paywalls or CAPTCHAs.

2. **1-Click Transfer to Curevo AI**:
   - Automatically pre-fills the Job Title, Company, Location, and Description directly in Curevo AI's Job Discovery Hub (`https://enhancecv-orpin.vercel.app/jobs`).
   - Immediately runs ATS match analysis against your active CV draft.

3. **1-Click JSON Copy**:
   - Copies valid `curevo_saved_jobs_v1` JSON directly to your clipboard for manual backup or import.

---

## Installation Guide (Chrome / Edge / Brave / Opera)

1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left corner.
4. Select the `extension/` folder in this repository.
5. Pin the Curevo AI icon to your browser toolbar.
6. Browse to any job posting (e.g. LinkedIn or Indeed) and click the Curevo icon!

---

## File Structure

- `manifest.json`: Manifest V3 declaration with least-privilege permissions (`activeTab`, `scripting`, `storage`).
- `content.js`: Privacy-safe in-page extractor for visible job metadata.
- `popup.html`: Clean extension popup UI with 1-click import.
- `popup.js`: Bridge between active tab extraction and Curevo AI web application.
- `background.js`: Optional background service worker for storage synchronization.
