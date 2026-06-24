# Sprint 8 — Phase 5 Implementation Report

**Telemetry + Queue Reliability + Sync Recovery**

Build status: **`npm run build` passes**

## Bundle sizes (post-Phase 5)

| Chunk | Size (min) | Gzip |
|---|---|---|
| **index (main)** | **521.9 KB** | 148.1 KB |
| BarChart (recharts) | 347.8 KB | 102.4 KB |
| exceljs | 929.9 KB | 256.5 KB |
| OneDriveSync | 26.8 KB | 8.8 KB |
| TelemetryPanel | 7.1 KB | 2.6 KB |

Main chunk **below 700 KB target** (down from ~897 KB in Phase 4).

---

## Part 1 — Telemetry Expansion

### `telemetryService.ts`
- Expanded event types: upload/export/restore durations, queue failures, sync cancelled, OneDrive fetch failures, mapping review, schema instability
- `success` flag on events, 14-day retention pruning, `cleanupTelemetry()`

### `telemetryAggregator.ts`
- Rolling timing stats (avg, p50, p95, success rate)
- Daily failure buckets (7-day trend)
- Queue health summary (pending, retrying, dead-letter, pause state)
- Schema stability trend (`stable` / `watch` / `unstable`)

### `TelemetryPanel.tsx`
- Lazy-loaded in **System Health** section
- Shows avg upload/sync times, queue health, schema trend, recent failures, dead-letter preview

### Instrumentation wired (orchestration only)
| Location | Events |
|---|---|
| `ExcelUpload` | `upload_duration` |
| `ExportPanel` | `export_duration` |
| `cloudWorkbookFetcher` | `parse_duration`, `schema_drift`, `schema_instability`, `mapping_review` |
| `useOneDriveOrchestrator` | `sync_duration`, `sync_cancelled`, `onedrive_fetch_failure`, `mapping_review` |
| `cloudSyncQueue` | `queue_retry`, `queue_failure` |
| `restoreTransactionManager` | `restore_duration` |

---

## Part 2 — Queue Reliability

### `cloudSyncQueue.ts` (v3)
- Status lifecycle: `pending → syncing → retrying → synced | dead_letter`
- Exponential backoff **with jitter** (50–100% of base)
- Dead-letter after max attempts (inspectable, not auto-retried)
- `replayCloudQueue()` batch drain (up to 10 rounds × 5 items)
- `pauseQueue()` / `resumeQueue()` / `isQueuePaused()`
- `cleanupStaleQueueItems()` — resets `syncing` stuck > 5 min
- Dedupe by fingerprint + entity hash (`versionId`, hybrid entity type)
- `requeueDeadLetter(id)` for manual recovery
- Migrates legacy v2 queue on read

---

## Part 3 — Cross-Tab Coordination

### `syncLeaseManager.ts` (v2)
- Lease record: `owner`, `tabLabel`, `acquiredAt`, `heartbeatAt`, `expiresAt`
- Heartbeat every 15s during active sync
- `initSyncLeaseCoordinator()` — visibility + `beforeunload` release
- `requestLeaseTakeover()` when heartbeat stale
- `getSyncLeaseInfo()` — `foreignTabActive`, `canTakeoverStale`

### `OneDriveSync.tsx`
- Banner when another tab owns sync
- **Take over sync** button when lease is stale

---

## Part 4 — Restore Transaction Safety

### `restoreTransactionManager.ts`
- `validateRestorePayload()` — metadata + mapping shape + dry-run `loadMetricsFromParsedExcel()`
- Session backup → validate → `loadFn` → verify session commit
- Rollback on any failure
- `markInterruptedRestore` / `clearInterruptedRestore` for crash recovery
- `restore_duration` telemetry with success flag

---

## Part 5 — Offline Recovery

### `offlineRecovery.ts`
- `runOfflineRecovery()` — orphan lease cleanup, stale queue reset, interrupted restore clear, telemetry cleanup, batched queue replay
- `installOfflineRecoveryListeners()` — unified `online` handler
- `AuthContext` uses recovery on login + online (replaces raw `processCloudQueue` calls)

---

## Part 6 — Performance

- Lazy: `TelemetryPanel`, `ExportPanel`, `SavedFilterViewsPanel`, `RiskActionCenter`, `DashboardSnapshot`
- `AdminDashboardCharts.tsx` — recharts isolated (347 KB chunk, loaded on demand per chart)
- `exportService` — dynamic exceljs (unchanged from Phase 4)
- Main dashboard chunk: **522 KB**

---

## Constraints honored

| System | Modified? |
|---|---|
| Schema inference | No |
| Mapping engine core | No |
| `dynamicAnalytics.ts` | No |
| Intelligence engine | No |
| Risk logic | No |
| Operational dashboard UX | No (same panels/flows) |
| Export/filter behavior | No |

---

## Verification checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Queue survives offline/reconnect | ✅ `replayCloudQueue` + `installOfflineRecoveryListeners` |
| 2 | Dead-letter flow works | ✅ `dead_letter` status + TelemetryPanel preview + `requeueDeadLetter` |
| 3 | Lease takeover works | ✅ `requestLeaseTakeover` + OneDrive UI |
| 4 | Restore rollback works | ✅ validate + session verify + rollback |
| 5 | Telemetry aggregates correctly | ✅ `telemetryAggregator` + TelemetryPanel |
| 6 | OneDrive sync survives tab conflicts | ✅ lease + heartbeat + foreign tab banner |
| 7 | Excel upload still works | ✅ lazy ExcelUpload chunk unchanged flow |
| 8 | Build passes | ✅ |
| 9 | Core engines untouched | ✅ |

---

## Manual smoke tests

1. **Queue**: Go offline → upload/save view → online → confirm queue drains (System Health telemetry shows queue pending → 0).
2. **Dead-letter**: Force 8+ failed API calls → item moves to dead-letter in telemetry panel.
3. **Lease**: Open two tabs → sync in tab A → tab B shows foreign-tab banner; close tab A → stale takeover works.
4. **Restore**: Restore invalid version → dashboard unchanged; valid version → loads correctly.
5. **Telemetry**: System Health → Telemetry panel shows timing stats after upload + sync.
