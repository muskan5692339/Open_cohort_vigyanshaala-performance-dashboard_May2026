# Sprint 8 — Phase 5 Architecture

**Telemetry + Queue Reliability + Sync Recovery**

## Weak Points Identified (Phase 4 baseline)

| Area | Gap |
|---|---|
| Queue | No jitter → retry storms; `failed`/`abandoned` conflated with dead-letter; no pause/resume; dedupe misses `retrying`; full scan every replay |
| Telemetry | Raw events only; missing export/upload/cancel/fetch coverage; no aggregation or retention |
| Lease | No heartbeat interval; stale tabs hold lease until TTL; no visibility/unload cleanup; no takeover UX |
| Restore | Session string backup only; no pre-commit validation; `loadFromParsed` never throws |
| Offline | Queue replay duplicated in AuthContext; no interrupted sync/restore recovery |
| Bundle | Main chunk ~897KB; recharts + dashboard panels still eager |

## Design Principles

- **Orchestration only** — no changes to schema inference, mapping core, analytics, intelligence, risk logic, dashboard UX behavior, or export/filter semantics
- **Local-first** — telemetry and queue state in org-scoped localStorage; cloud sync optional later
- **Fail-safe** — restore and sync never corrupt active session; leases expire and can be taken over

---

## Part 1 — Telemetry Expansion

```
telemetryService (raw events, org-scoped)
        ↓
telemetryAggregator (rolling + daily buckets, percentiles, cleanup)
        ↓
TelemetryPanel (lazy, System Health section)
```

**New event types:** `upload_duration`, `export_duration`, `restore_duration`, `queue_failure`, `sync_cancelled`, `onedrive_fetch_failure`, `mapping_review`, `schema_instability`

**Aggregator outputs:** avg/p50/p95 durations, success/failure rates, queue health, schema stability trend, recent failures list.

---

## Part 2 — Queue Reliability

**Lifecycle:** `pending → syncing → retrying → synced | failed → dead_letter | abandoned`

| Feature | Implementation |
|---|---|
| Jitter | `backoff * (0.5 + random * 0.5)` |
| Dead letter | After max attempts → `dead_letter` (inspectable, not retried auto) |
| Dedupe | Same fingerprint blocks pending/syncing/retrying/failed |
| Batching | Process up to 5 eligible items per run |
| Pause/resume | `vs_queue_paused` flag |
| Stale cleanup | Items stuck in `syncing` > 5 min → reset to `retrying` |

Queue key migrates `v2 → v3` on read.

---

## Part 3 — Cross-Tab Lease

Enhanced lease record:
```typescript
{ owner, tabLabel, acquiredAt, heartbeatAt, expiresAt }
```

- Heartbeat every 15s during active sync
- `visibilitychange`: pause heartbeat when hidden; renew when visible if owner
- `beforeunload`: release if owner
- `requestLeaseTakeover()` when lease stale (>2× TTL since heartbeat)
- OneDrive UI shows foreign-tab message + takeover button when stale

---

## Part 4 — Restore Transaction Safety

```
backup session → fetch → validateRestorePayload()
  → dry-run loadMetricsFromParsedExcel()
  → loadFn() → verify session write
  → commit | rollback session
```

Validation guards mapping shape and non-empty data without modifying analytics engine.

---

## Part 5 — Offline Recovery

`offlineRecovery.ts` orchestrates on reconnect/login/boot:

1. Clear orphaned leases (stale heartbeat)
2. Reset stuck queue items
3. Batch replay queue (respect pause)
4. Resume interrupted restore markers (if any)

Single entry point replaces scattered `processCloudQueue` calls.

---

## Part 6 — Performance

- Lazy `TelemetryPanel`, `ExportPanel`, `SavedFilterViewsPanel`, `RiskActionCenter`
- Recharts isolated via lazy dashboard chart block component
- exceljs remains in upload/export lazy chunks only

Target: main chunk < 700KB.

---

## Milestone Plan

1. Telemetry service + aggregator + panel → build
2. Queue hardening → build
3. Lease coordinator + OneDrive UX → build
4. Restore safety + offline recovery → build
5. Performance splits + docs → build + verification
