# Deployment Guide — VigyanShaala Performance Dashboard

## Overview

- **Frontend:** Vite + React on Vercel
- **API:** Vercel serverless (`/api/*`)
- **Database:** Supabase Postgres + Auth + Storage
- **Analytics:** Browser-only (no server-side analytics computation)

---

## 1. Supabase setup

1. Create a Supabase project.
2. Run migrations in order:
   - `supabase/migrations/001_init_tables.sql` … `005_refresh_matview_fn.sql`
   - `006_sprint8_cloud.sql`
   - `007_sprint8_rls.sql`
3. Create Storage bucket **`workbooks`** (private).
4. Enable **Email** auth provider (password + magic link).
5. Copy **Project URL** and **anon key** → Vercel env.
6. Copy **service role key** → Vercel env only (never expose to browser).

### First admin user

After signup via the app:

```sql
INSERT INTO organization_members (organization_id, user_id, role)
SELECT '00000000-0000-4000-8000-000000000010', id, 'admin'
FROM profiles WHERE email = 'admin@yourorg.org';
```

---

## 2. Vercel deployment

```bash
npm run build
vercel --prod
```

### Environment variables (Production)

| Variable | Scope |
|----------|--------|
| `VITE_SUPABASE_URL` | Production + Preview |
| `VITE_SUPABASE_ANON_KEY` | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Production only (server) |
| `AZURE_*`, `ONEDRIVE_*` | If using scheduled sync |

### Auth redirect URLs

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`, `http://localhost:5173/**`

---

## 3. OneDrive app registration (Azure)

1. Azure Portal → App registrations → New registration.
2. Add redirect URI for SPA if using browser Graph (`graphClient.ts`).
3. API permissions: `Files.Read`, `User.Read` (delegated); `Files.Read.All` (application) for server cron.
4. Create client secret → `AZURE_CLIENT_SECRET`.
5. Set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` on Vercel.

Scheduled sync: `vercel.json` cron hits `POST /api/sync` weekly.

---

## 4. Local development

```bash
cp .env.example .env.local
# fill Supabase + service role keys
npm run dev          # Vite frontend :5173
npm run dev:api      # vercel dev for /api routes
```

Without Supabase: app runs **local-first** (Excel + localStorage) with no login required.

With Supabase configured: admin routes require authentication.

---

## 5. Architecture notes

- Upload persistence: `POST /api/persist-upload` stores metadata + optional workbook JSON in Storage.
- Analytics generated in browser via `generateDynamicAnalytics` — not stored as blobs in DB.
- Offline queue: failed cloud writes stored in `vs_cloud_sync_queue_v1`, flushed on login.

See `SPRINT8_ARCHITECTURE.md` for full schema and migration plan.
