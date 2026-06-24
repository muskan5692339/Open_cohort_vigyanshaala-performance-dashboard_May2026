# Sprint 8 Phase 4 — Hybrid Persistence Architecture

## Current state (inspected)

| Store | Key | Cloud today |
|-------|-----|-------------|
| savedFilterViewsStore | `vs_saved_filter_views_v1` | None |
| riskActionStore | `vs_risk_actions_v1` | None |
| auditLogStore | `vs_audit_log_v1` | None |
| schemaProfileStore | `vs_schema_profiles_v1` | via persist-schema-profile API |
| uploadSnapshotStore | `vs_upload_snapshots_v1` | None |
| cloudConfig queue | `vs_cloud_sync_queue_v1` | flush on login, no backoff |

## Target architecture

```
UI → Repository (list/create/update/delete)
       ├─ readScoped(orgId)     ← immediate local response
       ├─ writeScoped(orgId)      ← local cache
       └─ sync() / hydrate()      ← async Supabase + cloudSyncQueue
```

**Org isolation:** `resolveOrgId()` from AuthContext session membership; cache keys `vs_<entity>_<orgId>`.

**Queue lifecycle:** pending → syncing → synced | failed | abandoned; exponential backoff; dedupe by operation fingerprint.

**Conflict rules:** `conflictResolution.ts` — latest wins (views), append-only (audit/risk), newest signature (schema), immutable (snapshots/runs).

**Restore:** `restoreTransactionManager` snapshots sessionStorage before restore; rollback on failure; append restore history.

**Lease:** `syncLeaseManager` — single-tab auto-sync via localStorage lease TTL.

**Compression:** gzip JSON payloads before Storage upload; content hash dedupes versions.

## Implementation stages

1. orgScopedStorage + repositories + store delegation
2. cloudSyncQueue + AuthContext hydrate/boot replay
3. conflictResolution + cloud sync helpers
4. restoreTransactionManager + SyncRunsPanel
5. workbookCompression + persist-upload dedup
6. syncLeaseManager + orchestrator integration
7. telemetryService
8. Build splitting (DataSourcePage sub-chunks, exceljs dynamic)

Constraints: no changes to inference, mapping core, analytics, intelligence, risk logic, export/filter UX.
