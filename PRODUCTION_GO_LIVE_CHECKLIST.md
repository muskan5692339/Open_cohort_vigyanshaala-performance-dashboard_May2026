# Production Go-Live Checklist

Use this checklist before exposing the dashboard to real cohort administrators.

---

## 1. Supabase & migrations

- [ ] `007_sprint8_rls.sql` applied — RLS on `uploads`, `upload_versions`, `sync_runs`, `hybrid_sync_cache`, etc.
- [ ] `009_sprint8_phase4_hybrid.sql` applied — hybrid cache policies
- [ ] `010_sprint8_phase4_compression_restore.sql` applied (if using gzip restore)
- [ ] `011_storage_workbooks_rls.sql` applied — private `workbooks` bucket
- [ ] `organization_members` populated for every production user
- [ ] Service role key **only** in Vercel/server env (never `VITE_*`)

---

## 2. API security

- [ ] Confirm protected routes return **401** without Bearer token (manual or script)
- [ ] Confirm **403** for valid user wrong org
- [ ] **Decision:** `POST /api/upload-sync` — disabled, internal-only, or wrapped with `assertOrgAccess`
- [ ] **Decision:** `POST /api/sync` — same
- [ ] Azure app: `Files.Read.All` with admin consent (resolve-share / fetch-workbook)
- [ ] CORS / deployment URL matches Supabase auth redirect allowlist

---

## 3. Environment variables (Vercel)

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (OneDrive server routes)
- [ ] No secrets in client bundle (`npm run build` + inspect dist)

---

## 4. Functional smoke (staging)

- [ ] Sign in (password or magic link)
- [ ] Excel upload → dashboard loads metrics
- [ ] Column mapping save → schema profile persists
- [ ] Cloud hybrid sync (if enabled) — queue drains, no dead letters
- [ ] Restore upload version — rollback on failure
- [ ] OneDrive sync (admin) — lease held/released, no parallel conflict
- [ ] Org switch (if multi-org user) — data refreshes for new org
- [ ] Sign out — session cleared

---

## 5. Operational

- [ ] `npm run build` passes in CI
- [ ] `npm run test` passes in CI
- [ ] Error monitoring configured (Sentry/etc.) — optional
- [ ] Backup strategy for Supabase (point-in-time)
- [ ] Runbook for dead-letter queue (Telemetry panel → Requeue)

---

## 6. Performance & limits

- [ ] Main bundle acceptable on target networks (~527KB JS + lazy charts/excel)
- [ ] localStorage quota acceptable for telemetry (300 events, 14d) and queue (100 items)
- [ ] Large workbook upload tested near size limits

---

## 7. Known limitations (accept or fix)

- [ ] Queue/lease keys are per-browser, not per-org (shared machine risk)
- [ ] Legacy unauthenticated sync APIs (if still enabled)
- [ ] Interrupted restore does not auto-resume
- [ ] Telemetry cloud sync is local-only stub

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Product / Program | | |
| Security review | | |
