# Technical Debt Register

Living register for post–Sprint 8 work. **Do not** address analytics/mapping/export items here.

---

## Critical

| ID | Item | Location | Effort | Notes |
|----|------|----------|--------|-------|
| TD-C1 | Unauthenticated legacy sync API | `api/upload-sync.ts` | M | Add `assertOrgAccess` or return 410 Gone |
| TD-C2 | Unauthenticated legacy OneDrive API | `api/sync.ts` | M | Deprecate in favor of orchestrator + `fetch-workbook` |

---

## High

| ID | Item | Location | Effort | Notes |
|----|------|----------|--------|-------|
| TD-H1 | Global cloud sync queue keys | `cloudSyncQueue.ts` | M | Prefix with `organizationId` + one-time migration |
| TD-H2 | Global sync lease keys | `syncLeaseManager.ts` | M | Same as TD-H1 |
| TD-H3 | Multi-tab queue race | `cloudSyncQueue.ts` | L | BroadcastChannel or lease-gated process |
| TD-H4 | `DEFAULT_ORG_ID` before auth | `orgScopedStorage.ts` | S | Block writes until resolver set |
| TD-H5 | Apply storage RLS migration | `011_storage_workbooks_rls.sql` | S | Ops task |

---

## Medium

| ID | Item | Location | Effort | Notes |
|----|------|----------|--------|-------|
| TD-M1 | `syncRunStore` not org-scoped | `syncRunStore.ts` | M | Align with repository pattern |
| TD-M2 | `dashboardHealthMonitor` global | `dashboardHealthMonitor.ts` | S | Scope or move to telemetry |
| TD-M3 | `recommendationHistoryStore` global | `recommendationHistoryStore.ts` | S | Scope by org |
| TD-M4 | Interrupted restore no resume | `offlineRecovery.ts` | M | User prompt + `restoreTransactionManager` |
| TD-M5 | Dual OneDrive code paths | `ondriveSync`, `SyncManager` | L | Remove legacy after parity |
| TD-M6 | `syncTelemetryToCloud` stub | `telemetryService.ts` | M | Backend endpoint + auth |
| TD-M7 | Queue pause no admin UI | — | S | Button in Telemetry or Data Source |
| TD-M8 | `flushSyncQueue` unused | `cloud/cloudConfig.ts` | S | Wire or remove export |

---

## Low

| ID | Item | Location | Effort | Notes |
|----|------|----------|--------|-------|
| TD-L1 | Main chunk >500KB warning | Vite build | M | Further lazy routes if needed |
| TD-L2 | exceljs ~930KB chunk | dynamic imports | — | Already lazy in parsers |
| TD-L3 | npm audit highs | `package.json` | M | Scheduled dependency bump |
| TD-L4 | `schemaChangeDetector` vs repo threshold | 0.3 vs 0.55 | S | Document or unify intentionally |
| TD-L5 | Lease heartbeat when tab hidden | `syncLeaseManager.ts` | S | Optional background heartbeat |
| TD-L6 | Coordinator cleanup on sign-out | `offlineRecovery.ts` | S | Call `coordinatorCleanup` on logout |

---

## Resolved (stabilization pass 2026-05-27)

| ID | Resolution |
|----|------------|
| — | Ineffective dynamic import (`uploadSnapshotsRepository`) |
| — | Duplicate `runOfflineRecovery` on boot |
| — | Hydrate loading stuck on error |
| — | Org switch without re-hydrate |
| — | `latestProfileByHeaders` reading legacy global key |
| — | Queue write throws on quota |
| — | Dead-letter items never pruned |
| — | `telemetryAggregator` raw pause key read |

---

## Protected API routes (reference)

Authenticated with `assertOrgAccess` or `assertAuthenticatedForSyncOps`:

- `/api/sync-hybrid`, `/api/persist-upload`, `/api/list-uploads`, `/api/list-upload-versions`
- `/api/restore-upload-version`, `/api/persist-sync-run`, `/api/list-sync-runs`
- `/api/persist-schema-profile`, `/api/fetch-workbook`, `/api/resolve-share`

**Not protected:** `/api/upload-sync`, `/api/sync`
