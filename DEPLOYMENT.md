# Deployment

- Frontend → Vercel
- Backend → Render
- Database → Supabase PostgreSQL

## 1. Database (Supabase)

1. Create a Supabase project.
2. Copy the session-pooler connection string (Project Settings → Database → Connection string → URI).
3. Tables are created automatically on server start (`initializeDatabase()` runs `CREATE TABLE IF NOT EXISTS …`), so no manual migration step is required.

## 2. Backend (Render)

- **Build command:** `cd server && npm install && npm run build`
- **Start command:** `cd server && node dist/index.js`
- **Environment variables:**
  - `DATABASE_URL` — Supabase connection string (secret)
  - `JWT_SECRET` — long random string (secret)
  - `APP_URL` — public URL of the frontend (used in verification/reset email links)
  - `NODE_ENV=production`
  - optional AI agent: `AI_PROVIDER=openai`, `AI_API_KEY` (secret), `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_ITERATIONS`
  - optional billing: `STRIPE_SECRET_KEY` (secret), `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM`, `STRIPE_WEBHOOK_SECRET` (secret)
  - optional email: `EMAIL_PROVIDER` (`resend`|`sendgrid`), `EMAIL_API_KEY` (secret), `EMAIL_FROM`
  - optional job discovery: `JOBS_API_URL`, `JOBS_API_KEY` (secret)
  - optional company research: `RESEARCH_SEARCH_API_URL`, `RESEARCH_SEARCH_API_KEY` (secret)
  - optional monitoring: `SENTRY_DSN` (secret)
  - optional admin bootstrap: `ADMIN_EMAILS` (comma-separated)
  - optional: `WEB_DIST` if you serve the frontend from the same service
- Every optional integration degrades gracefully: the app boots and all core resume features work without them.
- Add the webhook endpoint `https://YOUR-RENDER-SERVICE.onrender.com/api/billing/webhook` in the Stripe dashboard (subscription events) when billing is enabled.
- TLS to Supabase is enabled automatically for non-localhost hosts (`src/db/db.ts`).

## 3. Frontend (Vercel)

- **Root directory:** `web`
- Build command `npm run build` (default framework detection: Vite).
- The frontend calls the API at the same origin (`/api/...`). On Vercel, add a rewrite so API requests go to the Render service:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RENDER-SERVICE.onrender.com/api/:path*" }
  ]
}
```

- Because the API then runs on a different origin, session cookies need same-site-friendly settings: the server already sends `SameSite=Lax; Secure` cookies in production, and Vercel forwards cookies per-domain. If cookie issues occur across domains, prefer serving frontend and API under one domain (Vercel rewrite as above) — this is the supported setup.

## 4. Local development

```bash
# database
docker compose up -d

# server
cd server
cp .env.example .env   # set DATABASE_URL=postgres://postgres:ecvlocal@localhost:5434/enhancecv
npm run dev            # http://localhost:4000

# web (separate shell)
cd web
npm run dev            # http://localhost:5173 (proxies /api → :4000)
```

## 5. Tests

The integration suite runs against a real PostgreSQL database:

```bash
# start the test database (same container is reused; DB name differs)
docker run -d --name ecv-pg -e POSTGRES_PASSWORD=ecvlocal \
  -e POSTGRES_DB=enhancecv_test -p 5434:5432 postgres:15-alpine

cd server
npm test               # uses TEST_DATABASE_URL or the default above
```

`TEST_DATABASE_URL` overrides the target database. Tables are truncated between runs; never point the test suite at a database holding real data.
