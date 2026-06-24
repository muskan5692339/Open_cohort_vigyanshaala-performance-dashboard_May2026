# Environment setup — Excel upload and dashboard

## Run locally with API routes

Excel import calls `POST /api/upload-sync`, which only works when Vercel serverless functions are running:

```bash
npm run dev:api
```

This is the same as `vercel dev`. Do **not** use `npm run dev` alone for uploads — Vite will not serve `/api/*` and imports will fail with HTTP 404.

## Required variables (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (browser + API) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (browser reads) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (`api/upload-sync` writes) |
| `SUPABASE_DB_PASSWORD` | Database password (only for `npm run db:migrate`) |

Apply migration 005 (creates `refresh_student_performance_summary()`):

```bash
# Add SUPABASE_DB_PASSWORD to .env.local from Supabase → Settings → Database
npm run db:migrate
```

Or paste `supabase/migrations/005_refresh_matview_fn.sql` into the Supabase SQL Editor.

Example `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`api/upload-sync.ts` loads `.env.local` automatically when running under `vercel dev`.

## Import → dashboard flow

1. Start `npm run dev:api`.
2. Open Admin Console → **Data Sources** → **Excel Upload**.
3. Enter the **Cohort** name (e.g. `Incubator 11.0`) and upload `.xlsx`.
4. Click **Import to Supabase** and confirm success.
5. Go to **Dashboard** (or wait for auto-navigation after import).
6. Set the cohort filter to the cohort you imported if KPIs look mixed with older data.

## Verify in Supabase

After import, check:

- `students` — row count matches roster
- `attendance_records`, `assignment_submissions`, `quiz_results`
- `engagement_metrics` — imported Excel percentages (wide-format)
- `sync_logs` — latest `status = success`

## Production (Vercel)

Set the same three variables in **Vercel → Project → Settings → Environment Variables**, then redeploy.
