# Phase 3 — OneDrive Sync Orchestration Architecture

## Current flow (before Phase 3)

```
OneDriveSync.tsx → POST /api/sync → server parse → Supabase upsert (legacy)
ExcelUpload.tsx  → validate → preview → parse → loadFromParsed (browser analytics)
```

**Gap:** OneDrive path bypasses Sprint 7 pipeline and browser analytics.

## Target flow (Phase 3)

```
Scheduler / Manual "Sync Now"
        │
        ▼
POST /api/fetch-workbook  (Azure app credentials → xlsx bytes)
        │
        ▼
orchestrateCloudWorkbookSync()  [cloudWorkbookFetcher.ts]
  validate → preview → parse → fuzzy mapping → schema migration detect
        │
        ├── status failed → preserve previous dashboard (no loadFromParsed)
        │
        └── status success|warning → loadFromParsed → analytics refresh
                    │
                    ▼
            persist upload_version + sync_run + optional snapshot
```

## Retry strategy

| Failure | Action |
|---------|--------|
| Network fetch | 1 automatic retry after 2s; then show retry CTA |
| Validation error | No retry; user fixes workbook |
| Parse partial | Warning status; load with remaining mappings |
| Cloud persist fail | Local queue (`vs_cloud_sync_queue_v1`); dashboard still updates |

## Versioning strategy

- First sync: `uploads` row + `upload_versions` v1 + Storage payload
- Repeat sync same file: same `upload_id`, increment `version_number`, link `sync_run_id`
- Restore: fetch Storage JSON → `loadFromParsed()` (no server analytics)

## Scheduler lifecycle

```
syncScheduler.ts
  - read prefs from localStorage
  - on interval tick: if !isRunning && autoSyncEnabled → triggerSync()
  - pause/resume clears interval
  - manual sync sets lastSyncAt on completion
```

Intervals: `manual` | `15` | `30` | `60` minutes.

## Failure recovery

On sync failure:
1. Do **not** call `loadFromParsed`
2. Previous `sessionStorage` payload unchanged
3. Sync run recorded as `failed`
4. UI shows retry + last successful sync timestamp

## Constraints

- Parsers, inference, mapping engine, analytics, intelligence, risk — **unchanged**
- Orchestration only wraps existing Sprint 7 functions
