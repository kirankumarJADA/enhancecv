# Curevo AI Job Saver (browser extension)

A minimal Manifest V3 extension that saves the job posting on the current tab into your Curevo AI account.

## How it works

1. The **content script** extracts job fields (title, company, location, salary, description) from *visible page content* using common structures: JSON-LD `JobPosting` blocks, widely used job-page selectors, and meta tags. It does **not** bypass logins, CAPTCHAs, or anti-bot protections — pages that don't expose a structure simply fail and you can paste the description manually in Curevo.
2. The **popup** connects the extension to your Curevo account using an API token you generate in the app (Profile → extension token flow, `POST /api/auth/extension-token`). The token is stored only in your browser's local extension storage and is sent only to your configured Curevo API URL. No backend secrets are embedded.
3. The **service worker** sends the job to the Curevo API (`POST /api/jobs/import-url`; falls back to `POST /api/jobs/import-paste` with the visible-page fields when the page is login-walled). Saved jobs appear in Curevo under **Find Jobs → Saved Jobs** with fit analysis.

## Install (unpacked, development)

1. Load the Curevo app and sign in.
2. Create an extension token (authenticated call to `POST /api/auth/extension-token`, or via the Profile page once wired in the UI).
3. Chrome/Edge: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select this `extension/` directory.
4. Click the Curevo icon, enter your API URL (e.g. `http://localhost:4000`) and paste the token, then **Connect**.
5. Open a job posting page and click **Save this job**.

## Files

- `manifest.json` — MV3 manifest, least-privilege permissions
- `content.js` — visible-content extraction
- `background.js` — API calls (token from storage)
- `popup.html` / `popup.js` — connect + save UI

## Privacy & security notes

- No secrets are bundled; the token is user-generated and revocable (`DELETE /api/auth/extension-tokens/:id`).
- The extension only requests `activeTab` + `scripting` and talks only to the API URL you configure.
- Extraction reads only what is visible on the page the user opened.
