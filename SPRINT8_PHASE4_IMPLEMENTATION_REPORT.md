# Sprint 8 — Phase 4 Implementation Report

**Hybrid Persistence + Organization-Aware Data Layer**

Build status: **`npm run build` passes** (main chunk **897 KB**, gzip **256 KB** — exceljs split to lazy chunk **930 KB**).

---

## Summary

Phase 4 adds a local-first repository layer with async Supabase sync, org-scoped storage, hardened offline queue, conflict resolution, gzip workbook deduplication, restore rollback guards, cross-tab sync leases, and telemetry — without modifying schema inference, mapping core, analytics, intelligence, risk logic, dashboard UX, or export behavior.

---

## Part 1 — Repository Layer

Created `src/repositories/`:

| Repository | Cache key base | Cloud entity |
|---|---|---|
| `savedViewsRepository.ts` | `vs_saved_views_<orgId>` | `saved_views` |
| `riskActionsRepository.ts` | `vs_risk_actions_<orgId>` | `risk_actions` |
| `auditRepository.ts` | `vs_audit_log_<orgId>` | `audit_logs` |
| `schemaProfileRepository.ts` | `vs_schema_profiles_<orgId>` | `schema_profiles` |
| `uploadSnapshotsRepository.ts` | `vs_upload_snapshots_<orgId>` | `upload_snapshots` |

Each exposes `list`, `create`/`update`/`delete`, `sync`, `hydrate`.

Legacy store files (`savedFilterViewsStore.ts`, etc.) are thin re-exports for backward compatibility.

`repositoryCloudSync.ts` handles push/pull/hydrate via `/api/sync-hybrid`.

---

## Part 2 — Organization Isolation

- `src/services/orgScopedStorage.ts` — `getScopedKey`, `readScoped`, `writeScoped`, `clearOrgScope`, `migrateLegacyKey`
- `AuthContext` registers `setOrgIdResolver()` from authenticated org membership
- `useSyncContext()` hook supplies `SyncContext` to UI components
- All UI persistence calls pass org context; legacy unscoped keys migrated once per org

Migration: `009_sprint8_phase4_hybrid.sql` (`hybrid_sync_cache` + RLS)

---

## Part 3 — Offline Queue Hardening

- `src/services/cloudSyncQueue.ts` — statuses: pending → syncing → synced | failed | abandoned
- Exponential backoff (2s base, 120s cap), max 8 attempts, fingerprint dedupe
- `cloudConfig.ts` delegates to `processCloudQueue` / `enqueueCloudOperation`
- Replay on: login (`AuthContext`), app boot, `online` event

---

## Part 4 — Conflict Resolution

`src/services/conflictResolution.ts`:

| Entity | Strategy |
|---|---|
| Saved views | Latest `updated_at` wins |
| Risk actions | Append-only merge by id |
| Audit logs | Append-only merge by id |
| Schema profiles | Newest `schema_signature` / `updated_at` |
| Upload snapshots | Immutable (dedupe by id) |

---

## Part 5 — Snapshot Persistence + Compression

- `src/services/workbookCompression.ts` — gzip + SHA-256 hash (browser helper)
- `api/persist-upload.ts` — server-side gzip (`zlib`), `content_hash` dedup skips duplicate `upload_versions`
- `api/restore-upload-version.ts` — gunzip legacy `.json` and new `.json.gz` payloads
- Migration: `010_sprint8_phase4_compression_restore.sql`

---

## Part 6 — Restore Safety

- `src/services/restoreTransactionManager.ts` — session backup, rollback on failure, restore history
- `SyncRunsPanel` uses `executeRestoreTransaction()` instead of direct `loadFromParsed`
- Cloud restore records `restored_from_version_id`, `restored_at`, `restored_by` on `uploads`

---

## Part 7 — Scheduler Ownership Protection

- `src/services/syncLeaseManager.ts` — localStorage lease (`vs_sync_lock_v1`), tab-scoped owner
- `useOneDriveOrchestrator` acquires lease before sync, renews during progress, releases in `finally`
- Prevents duplicate auto-sync across browser tabs

---

## Part 8 — Telemetry Foundations

`src/services/telemetryService.ts` — local-first events:

- `sync_duration`, `parse_duration`, `validation_failure`, `schema_drift`, `upload_size`, `queue_retry`, `restore_attempt`

Wired into: `cloudWorkbookFetcher`, `useOneDriveOrchestrator`, `cloudSyncQueue`, `SyncRunsPanel`

---

## Part 9 — Build Optimization

- `DataSourcePage` — lazy tabs (ExcelUpload, OneDriveSync, SyncHistory, SyncRunsPanel, UploadHistoryPanel)
- `exportService.ts` — dynamic `exceljs` import (export-only path)
- Main dashboard chunk reduced to **897 KB** (exceljs in separate lazy chunk)

---

## Wiring Checklist

| Integration | Status |
|---|---|
| Repositories → legacy store re-exports | ✅ |
| UI passes `SyncContext` | ✅ |
| Auth hydrate + queue replay | ✅ |
| Restore transaction guard | ✅ |
| Sync lease on OneDrive orchestrator | ✅ |
| Gzip + dedup on persist-upload | ✅ |
| Audit on saved views / risk actions | ✅ |
| `fuzzyHeaderMatching.listStoredProfiles` → repository | ✅ |

---

## Verification (Manual)

| # | Requirement | Expected |
|---|---|---|
| 1 | Excel upload | Works via lazy `ExcelUpload` chunk |
| 2 | OneDrive sync | Orchestrator unchanged; lease prevents tab conflicts |
| 3 | Offline mode | Queue persists; replays on login/online |
| 4 | Queue retry | Backoff + telemetry on failure |
| 5 | Org isolation | Keys scoped by org; resolver from auth |
| 6 | Restore rollback | Failed restore restores sessionStorage backup |
| 7 | No duplicate sync | Lease + in-tab lock |
| 8 | Analytics unchanged | No engine modifications |
| 9 | Exports unchanged | Same export functions; lazy exceljs |
| 10 | Build | `npm run build` passes |

---

## Migrations to Apply

```bash
# Apply in Supabase SQL editor or CLI:
supabase/migrations/009_sprint8_phase4_hybrid.sql
supabase/migrations/010_sprint8_phase4_compression_restore.sql
```

---

## Files Added / Modified (Key)

**New:** `src/repositories/*`, `src/services/orgScopedStorage.ts`, `cloudSyncQueue.ts`, `conflictResolution.ts`, `workbookCompression.ts`, `restoreTransactionManager.ts`, `syncLeaseManager.ts`, `telemetryService.ts`, `src/hooks/useSyncContext.ts`, `api/sync-hybrid.ts`, migrations 009–010

**Modified:** `AuthContext.tsx`, UI panels, `useOneDriveOrchestrator.ts`, `SyncRunsPanel.tsx`, `DataSourcePage.tsx`, `persist-upload.ts`, `restore-upload-version.ts`, `exportService.ts`, legacy store re-exports
