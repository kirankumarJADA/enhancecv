# Curevo AI — AI-Powered Resume Maker Agent

Build a better CV for every job. Curevo AI pairs a **deterministic, truth-first resume engine** with a **truth-guarded AI agent**: your Master CV is the single source of truth, and every AI-generated claim is validated against it before you ever see it.

## Core flow

```
Master CV + Job description
→ deterministic JD / ATS / CV↔JD analysis (authoritative scores)
→ AI reasoning + tailoring (when configured)
→ Truth Guard (every claim validated against the Master CV)
→ ATS + match re-verification
→ AI critique (bounded)
→ change explanations with evidence
→ template + version + PDF
→ application tracking
```

## Features

- **Master CV** — upload (PDF/DOCX) or guided questionnaire; always user-editable, never auto-modified
- **ATS analysis** — transparent 0–100 compatibility score derived from implemented rules (formatting, structure, content, skills, readability)
- **JD analysis & matching** — required/preferred skills, responsibilities, keywords, explainable Job Match score with per-requirement evidence
- **AI Resume Agent** — structured tailoring proposals + bounded critique loop; Truth Guard rejects fabricated technologies/metrics (prompt-injection resistant by construction)
- **Resume versions** — rename, duplicate, edit, delete; 3-pane live editor with undo/redo and AI suggestions
- **Templates** — 6 ATS-safe single-column templates with deterministic recommendations; template-aware PDF export
- **Cover letters & LinkedIn optimisation** — AI-generated, truth-guarded, sentence-level sanitisation; honest 503 when AI is not configured
- **Usage plans** — FREE/PRO/PREMIUM monthly quotas enforced server-side
- **Billing** — Stripe subscriptions (webhook signature verified, idempotent); degrades gracefully without keys
- **Email verification & password reset** — hashed single-use tokens with expiry; dev console provider for key-less development
- **Job discovery** — provider-abstracted job source (configure `JOBS_API_URL`), URL import with SSRF-safe fetching, transparent per-job fit fields (never a ranking)
- **Interview system** — truth-grounded preparation packages (11 question categories, STAR structures, study plan) and mock interviews with explainable qualitative evaluation (no invented scores); deterministic fallback without AI
- **Grammar / translation / company research agents** — all truth-guarded; company facts require a configured search provider and carry source URLs
- **Application tracking** — statuses from SAVED to OFFER, per-user isolation, one-click application from a saved job, status timeline
- **Career analytics & Health Center** — descriptive, non-prescriptive statistics; component-level deterministic resume health
- **Admin dashboard** — server-side role enforcement, aggregate stats, sanitised error log
- **Monitoring** — request correlation IDs, sanitised error capture, optional Sentry forwarding

## Stack

- Frontend: React + Vite + Tailwind (`web/`)
- Backend: Node + Express + TypeScript (`server/`)
- Database: PostgreSQL (Supabase in production) via `pg` — no ORM, parameterised SQL
- PDF: PDFKit (selectable text, ATS-safe)
- AI provider: any OpenAI-compatible API via plain `fetch` (optional)

## Development

```bash
# database
docker compose up -d

# server
cd server
cp .env.example .env      # set DATABASE_URL=postgres://postgres:ecvlocal@localhost:5434/enhancecv
npm run dev               # http://localhost:4000

# web (second shell)
cd web
npm run dev               # http://localhost:5173 (proxies /api → :4000)
```

## Tests

```bash
cd server
npm test        # 100 tests: engines, API integration, AI layer, platform features
```

Integration tests run against a real PostgreSQL (the Docker default above or `TEST_DATABASE_URL`). The live acceptance workflow: `PORT=4100 node scripts/acceptance.mjs` against a running server.

## Deployment

Frontend → Vercel, Backend → Render, Database → Supabase PostgreSQL. Full instructions: [DEPLOYMENT.md](DEPLOYMENT.md). All external integrations (AI, Stripe, email, Sentry) are optional — the product boots and works without them and says so honestly in the UI.

## Browser extension

`extension/` contains the Curevo Job Saver (Manifest V3): saves the job on the current tab into your account via an API token you generate in the app. See `extension/README.md`. No secrets are bundled; extraction reads visible page content only.

## Attribution

Concepts informed by the MIT-licensed [atsresume](https://github.com/sauravhathi/atsresume) and [ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) projects.
