# Final Stabilization Report — Sprint 8 + P0 Security

**Date:** 2026-05-27  
**Scope:** Pre-production hardening only — no analytics, mapping engine, export/filter, or dashboard logic changes.

---

## Production-readiness assessment

| Area | Status | Notes |
|------|--------|-------|
| Hybrid persistence + repositories | **Ready** | Org-scoped keys, cloud merge via `/api/sync-hybrid` |
| P0 API org auth | **Ready** | `assertOrgAccess` on Sprint 8 upload/sync routes |
| Client auth headers | **Ready** | Bearer + `organizationId` on protected callers |
| Table RLS (Supabase) | **Ready** (after migration) | `007`, `009` — apply in prod |
| Storage RLS | **Pending migration** | `011_storage_workbooks_rls.sql` |
| Legacy APIs | **Blocker** | `upload-sync`, `sync` — no membership check |
| Multi-tab queue/lease | **Acceptable risk** | Global keys; documented in tech debt |
| Build / unit tests | **Green** | `npm run build`, `npm test` (8 security tests) |

**Overall:** Safe for staged production **after** migrations and legacy API decision. Not recommended for open public deployment until legacy routes are gated.

---

## Architectural inconsistencies (identified)

1. **Dual OneDrive stacks** — `oneDriveSync` + orchestrator vs legacy `ondriveSync` / `SyncManager` / `api/sync.ts`.
2. **Global vs org-scoped storage** — Queue (`vs_cloud_sync_queue_v3`) and lease keys are browser-global; repositories are org-scoped.
3. **Hydrate vs replay split** — Repositories hydrate from cloud; queue replays via `runOfflineRecovery` only (by design, now unified on boot).
4. **Thin facades** — `*Store.ts` re-exports repositories; `syncRunStore`, `dashboardHealthMonitor`, `recommendationHistoryStore` remain legacy unscoped.
5. **Service role bypasses RLS** — Correct for server routes **only when** `assertOrgAccess` runs first.

---

## Duplicate abstractions

| Pattern | Resolution |
|---------|------------|
| `uploadSnapshotStore` → repository | Keep facade; removed ineffective dynamic import |
| `schemaChangeDetector` vs `schemaProfileRepository` | Detector now reads org-scoped storage (same data path) |
| `telemetryAggregator` pause check | Uses `isQueuePaused()` from queue module |
| Two offline recovery entry points on boot | Removed duplicate `getSession` replay in `AuthContext` |

---

## High-risk bug list (remaining)

| ID | Risk | Description |
|----|------|-------------|
| HR-1 | **Critical** | `POST /api/upload-sync` — service role, no JWT |
| HR-2 | **Critical** | `POST /api/sync` — same |
| HR-3 | **High** | Multi-tab queue may process same item (no distributed lock) |
| HR-4 | **High** | Global queue/lease keys on shared machines |
| HR-5 | **Medium** | `DEFAULT_ORG_ID` fallback before auth hydrates |
| HR-6 | **Medium** | Interrupted restore cleared without auto-resume |
| HR-7 | **Low** | `syncTelemetryToCloud` stub |

---

## Stabilization roadmap (completed vs deferred)

### Completed (this pass)

| Item | Impact |
|------|--------|
| Static repository imports in `hydrateAllRepositories` | Fixes Vite ineffective dynamic import; main chunk +~5KB |
| Auth hydrate generation guard + `try/finally` loading | Prevents stuck loading / stale hydrate overwrites |
| Remove duplicate boot `runOfflineRecovery` | Single replay path via `hydrate` |
| Re-hydrate on `setOrganization` | Org switch loads correct scoped data |
| Queue `writeQueue` quota handling + dead-letter TTL | Safer localStorage under pressure |
| Telemetry prune on quota + `cleanupTelemetry` fix | Correct prune count |
| `latestProfileByHeaders` org-scoped read | Aligns with repository storage |
| Legacy key removal after migration | Reduces double-read confusion |
| Telemetry panel requeue + focus/hover | Ops UX for dead letters |

### Deferred (next sprint — higher risk)

- Org-scope `cloudSyncQueue` and `syncLeaseManager` keys
- Gate or remove legacy `upload-sync` / `sync` APIs
- Scope `syncRunStore`, health, recommendation stores
- Queue tab-level locking (BroadcastChannel)
- Auto-resume interrupted restore
- Rate limiting / WAF on API routes

---

## Changes implemented (this session)

| File | Change | Risk |
|------|--------|------|
| `src/hooks/useSyncContext.ts` | Static imports for hydrate | **Low** |
| `src/context/AuthContext.tsx` | Hydrate mutex, loading fix, org switch hydrate, single replay | **Low** |
| `src/services/orgScopedStorage.ts` | `writeScoped` returns boolean; remove legacy after migrate | **Low** |
| `src/services/telemetryService.ts` | Quota-aware write + prune | **Low** |
| `src/services/cloudSyncQueue.ts` | Quota handling, dead-letter TTL, `purgeExpiredDeadLetters` | **Low** |
| `src/services/offlineRecovery.ts` | Call purge on recovery | **Low** |
| `src/services/telemetryAggregator.ts` | `isQueuePaused()` | **Low** |
| `src/services/schemaChangeDetector.ts` | Org-scoped profile read (same 0.3 match threshold) | **Low** |
| `src/components/system/TelemetryPanel.tsx` | Requeue button, focus/hover on cards | **Low** |

---

## Verification

```bash
npm run build   # ✓ passed (no ineffective dynamic import warning)
npm run test    # ✓ 8/8 assertOrgAccess tests
```

**Bundle note:** Main chunk ~527KB gzip ~149KB (was ~522KB) — acceptable tradeoff for correct chunk graph.

---

## Rollback considerations

- All changes are client-side except docs — revert individual commits by file.
- `writeScoped` now returns `boolean`; callers ignoring return value behave as before on success.
- Auth hydrate generation: if issues, revert `AuthContext.tsx` only.
- Queue compaction may drop old dead-letters (>7d) — irreversible locally only.

---

## Recommended next sprint

1. **P0.1** — Disable or auth-wrap `upload-sync` / `sync` (feature flag or 401 default).
2. **P1** — Org-scoped queue + lease keys with migration from v3 global keys.
3. **P1** — Apply Supabase migrations `007`, `009`, `011` in production.
4. **P2** — E2E smoke: sign-in → upload → hybrid sync → restore → org switch.
5. **P2** — Integrate `syncRunStore` with org-scoped pattern.

See also: `PRODUCTION_GO_LIVE_CHECKLIST.md`, `TECH_DEBT_REGISTER.md`, `SPRINT8_P0_SECURITY_HARDENING.md`.
