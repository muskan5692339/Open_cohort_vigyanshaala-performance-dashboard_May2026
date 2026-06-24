# Sprint 8 — Architecture Proposal

**Goal:** Add cloud persistence, authentication, OneDrive orchestration, and deployment layers **without** modifying schema inference, mapping engine, dynamic analytics, intelligence engine, risk logic, operational UX, exports, or filters.

---

## Current State (Baseline)

| Layer | Today |
|-------|--------|
| **Analytics** | Browser-only: `generateDynamicAnalytics` + `useOperationalDashboard` |
| **Admin data** | Excel → `UploadedExcelContext` (sessionStorage) |
| **Profiles / audit / views** | localStorage (`vs_*_v1` keys) |
| **Supabase** | Client + `api/upload-sync` + matviews; **admin UI does not load from DB** |
| **OneDrive** | Dual stack: `graphClient` + `api/sync` (server credentials) vs legacy `ondriveSync` |
| **Auth** | None (admin opens without login); RLS migrations expect JWT claims not wired |

---

## Design Principles

1. **Analytics never server-side** — cloud stores workbook metadata, mapping, snapshots (metrics summary only), not full `DynamicAnalyticsResult` JSON.
2. **Local-first preserved** — if Supabase/auth unavailable, existing localStorage + sessionStorage paths unchanged.
3. **Hybrid persistence** — write local immediately; async cloud sync when authenticated + configured.
4. **Thin integration** — existing stores gain optional `void syncXToCloud(...)` calls; engines untouched.

---

## Phase 1 — Database Schema (Exact)

New migration `006_sprint8_cloud.sql` adds workspace tables. Legacy `public.users` (password_hash) remains; app uses `profiles` linked to `auth.users`.

### `organizations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | |
| slug | text UNIQUE | URL-safe |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `profiles` (extends Supabase Auth)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → `auth.users(id)` ON DELETE CASCADE |
| email | text NOT NULL | |
| display_name | text | |
| created_at | timestamptz | |

### `organization_members`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK → organizations | |
| user_id | uuid FK → profiles | |
| role | text CHECK | `admin`, `program_manager`, `viewer` |
| is_active | boolean DEFAULT true | |
| UNIQUE(organization_id, user_id) | | |

### `uploads`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| file_name | text | |
| cohort_name | text | |
| source | text CHECK | `excel`, `onedrive`, `demo` |
| schema_signature | text | fileSignature hash |
| row_count | int | |
| status | text | `active`, `archived` |
| created_by | uuid FK → profiles nullable | |
| created_at | timestamptz | |

### `upload_versions`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| upload_id | uuid FK → uploads | |
| version_number | int | monotonic per upload |
| sheet_name | text | |
| row_count | int | |
| schema_signature | text | |
| changed_columns | jsonb | migration summary |
| sync_source | text | `manual`, `onedrive`, `api` |
| payload_storage_path | text nullable | Supabase Storage key |
| created_by | uuid | |
| created_at | timestamptz | |

**Payload storage:** `workbooks/{org_id}/{upload_id}/v{n}.json` contains `{ headers, rawRows, mapping, discoveredColumns }` — **no analytics blob**.

### `schema_profiles`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| file_signature | text | |
| headers | jsonb | string[] |
| mapping | jsonb | ColumnMapping |
| created_at / updated_at | timestamptz | |
| UNIQUE(organization_id, file_signature) | | |

### `upload_snapshots`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| upload_id | uuid FK nullable | |
| file_name | text | |
| metrics | jsonb | `UploadSnapshotMetrics` only |
| uploaded_at | timestamptz | |

### `saved_views`, `risk_actions`, `audit_logs`

Mirror local types; scoped by `organization_id` + optional `created_by`.

### `sync_runs` (OneDrive orchestration)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid | |
| status | text | `syncing`, `success`, `warning`, `failed` |
| message | text | |
| upload_version_id | uuid nullable | |
| started_at / finished_at | timestamptz | |

---

## Phase 1 — Persistence Strategy

```
User action (upload / mapping / audit)
        │
        ▼
┌───────────────────┐
│ Existing local    │  ← unchanged behavior, immediate
│ store (localStorage)│
└─────────┬─────────┘
          │ if isCloudReady()
          ▼
┌───────────────────┐
│ cloudSyncQueue    │  ← retry on failure, offline queue
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ POST /api/persist-* │  service role, validates org membership server-side (Phase 2+)
└─────────┬─────────┘
          ▼
     Supabase tables + Storage
```

**Restore flow:** `upload_versions` + Storage payload → `loadFromParsed()` — same as fresh Excel parse.

---

## Phase 2 — Auth Flow

```
LoginPage (email/password or magic link)
        │
        ▼
supabase.auth.signInWithPassword / signInWithOtp
        │
        ▼
AuthContext: session, profile, org membership, role
        │
        ▼
ProtectedRoute → AdminDashboardPage / DataSource / exports
```

**Roles → permissions (client guard + RLS):**

| Permission | admin | program_manager | viewer |
|------------|:-----:|:----------------:|:------:|
| Upload | ✓ | | |
| Mapping edit | ✓ | | |
| View dashboards | ✓ | ✓ | ✓ |
| Exports | ✓ | ✓ | |
| Risk actions | ✓ | ✓ | |
| Saved views | ✓ | ✓ | read |
| User management | ✓ | | |

**RLS (`007_sprint8_rls.sql`):** `organization_id` must match `auth.jwt() -> org_id` claim or subquery via `organization_members`.

---

## Phase 3 — OneDrive Sync Orchestration

```
Scheduler / manual "Refresh"
        │
        ▼
cloudWorkbookFetcher.ts  (Graph token or server /api/sync)
        │
        ▼
Existing Sprint 7 pipeline:
  validateUploadFile → previewWorkbook → parseWorkbookSheet
        │
        ▼
loadFromParsed + persist upload_version
        │
        ▼
sync_runs status badge
```

**Do not duplicate parse logic** — wrap `ExcelUpload` handlers / shared `importWorkbookPipeline.ts`.

---

## Phase 4 — localStorage → Cloud Migration

| Local key | Cloud table | Migration |
|-----------|-------------|-----------|
| `vs_schema_profiles_v1` | `schema_profiles` | On login: merge local → cloud (newer `updatedAt` wins) |
| `vs_audit_log_v1` | `audit_logs` | Append-only sync |
| `vs_saved_filter_views_v1` | `saved_views` | One-time import |
| `vs_risk_actions_v1` | `risk_actions` | One-time import |
| `vs_upload_snapshots_v1` | `upload_snapshots` | Metrics only |
| `vs_recommendation_history_v1` | `recommendation_history` (optional) | Phase 4b |
| `vs_dashboard_health_v1` | telemetry table | Phase 5 |
| `vs_uploaded_excel_v2` | Storage via `upload_versions` | On persist upload |

**Offline:** queue in `vs_cloud_sync_queue_v1`; flush when `isCloudReady()`.

---

## Phase 5–8 Summary

- **Error boundaries** around admin shell + data source
- **Progress/cancel** for parse via `AbortController` + Web Worker (future)
- **Telemetry** table: upload_ms, parse_fail, sync_fail
- **Lazy routes** + dynamic `exceljs` import (Phase 6)
- **DEPLOYMENT.md**: Vercel, Supabase, Azure app, auth redirects
- **Upload history UI** + restore version (Phase 7)
- **Export watermark** + audit (Phase 8)

---

## Implementation Order

| Phase | Deliverable | Build gate |
|-------|-------------|------------|
| 1 | Schema + `supabase.ts` + cloud services + persist API + upload hook | `npm run build` |
| 2 | AuthContext + Login + protected routes + RLS | `npm run build` |
| 3 | `cloudWorkbookFetcher` + sync status UI | build |
| 4 | Hybrid stores + org switcher | build |
| 5 | Error boundary + queue + telemetry | build |
| 6 | Code splitting + DEPLOYMENT.md | build |
| 7 | User mgmt + upload history + restore | build |
| 8 | RLS hardening + export governance | build |

---

## What We Will NOT Change

- `schemaInference.ts`, `schemaProfileStore.ts` core matching logic
- `dynamicAnalytics.ts`, `programIntelligence.ts`
- `exportService.ts` export algorithms
- `GlobalFilterBar`, operational components behavior
- Column mapping UI / inference outputs
