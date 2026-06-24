# Sprint 8 — Testing, Stabilization & Production Readiness

**Purpose:** Manual QA, risk triage, test strategy, and go-live checklist for NGO operational use (Excel upload, OneDrive sync, offline recovery, org-scoped cloud persistence).

**Prerequisites for all tests:**
- Run `npm run dev:api` (not `npm run dev` alone) so `/api/*` routes work
- `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Apply migrations `006`–`010` in Supabase SQL Editor
- Two browser profiles or two windows for multi-tab tests
- DevTools → Application → Local Storage / Session Storage visible

---

## 1. Manual QA Checklist

### 1.1 Excel upload flow

| Step | Action | Expected |
|------|--------|----------|
| E1 | Admin → Data Sources → Excel Upload | Tab loads (lazy chunk) |
| E2 | Empty cohort name → upload | Blocked with validation message |
| E3 | Upload `.xlsx` < 25 MB | Validation + preview; recommended sheet shown |
| E4 | Upload `.xls` / `.csv` / corrupt file | Clear error; dashboard unchanged |
| E5 | Confirm import on valid sheet | Parse succeeds; mapping step appears |
| E6 | Apply mapping → Visualize | KPIs populate; cohort filter works |
| E7 | Save mapping profile | Profile in org-scoped storage; audit entry |
| E8 | Re-upload same file signature | Prior mapping reused (fuzzy/exact) |
| E9 | Schema change (rename column) | Migration panel; warning status; no crash |
| E10 | Demo data load | Dashboard loads; cloud persist queued if online |
| E11 | Signed-in user | `persist-upload` succeeds; version in Sync Runs/history |
| E12 | **Hover UX** | Buttons/cards in upload area respond on hover (SyncManager.css / controls) |

**Record:** file name, row count, duration (Telemetry → avg upload), any console errors.

---

### 1.2 OneDrive sync flow

| Step | Action | Expected |
|------|--------|----------|
| O1 | Configure share URL → Test connection | Resolves fileId; green status |
| O2 | Save config → Sync Now | Progress phases: fetch → validate → preview → parse → persist |
| O3 | Successful sync | Dashboard updates; previous data replaced only on success |
| O4 | Failed validation | Error banner; **previous dashboard preserved** |
| O5 | Cancel mid-sync | Cancelled state; lease released; telemetry `sync_cancelled` |
| O6 | Auto-sync scheduler (15/30/60 min) | Only one run at a time; respects pause |
| O7 | Mapping review warning | Warning status; audit `mapping_change`; dashboard still loads |
| O8 | Repeat sync same workbook | Deduped upload version if content hash unchanged (cloud) |
| O9 | Check System Health → Telemetry | `sync_duration`, `parse_duration` events present |

---

### 1.3 Offline → online recovery

| Step | Action | Expected |
|------|--------|----------|
| R1 | Sign in while online | Repositories hydrate; queue replays |
| R2 | DevTools → Offline | Save filter view / risk action while offline |
| R3 | Go online | Queue drains; hybrid entities sync |
| R4 | Offline → trigger Excel persist path | Item enqueued (`vs_cloud_sync_queue_v3`) |
| R5 | Online | `replayCloudQueue` processes batches; item removed on 200 |
| R6 | Refresh after reconnect | No duplicate rows in saved views / audit |

---

### 1.4 Multi-tab lease conflict

| Step | Action | Expected |
|------|--------|----------|
| L1 | Tab A: start OneDrive sync | Acquires lease; heartbeat during progress |
| L2 | Tab B: Sync Now while A running | Error or “owned by another tab” banner |
| L3 | Tab A: complete sync | Lease released |
| L4 | Tab B: Sync Now | Succeeds |
| L5 | Tab A: kill tab mid-sync | After ~3 min stale heartbeat, Tab B “Take over sync” works |
| L6 | Two tabs auto-sync enabled | Only one effective sync (lease + in-tab lock) |

---

### 1.5 Restore transaction rollback

| Step | Action | Expected |
|------|--------|----------|
| V1 | Data Sources → History → Sync Runs → Restore | Loads version; dashboard updates |
| V2 | Note current cohort/KPIs before restore | Baseline captured |
| V3 | Restore valid cloud version | Success message; telemetry `restore_duration` success |
| V4 | Simulate failure (invalid versionId in DevTools) | Error; **session rolled back** if backup existed |
| V5 | Restore while offline (no payload) | Fails gracefully; no corrupt session |
| V6 | `uploads.restored_from_version_id` in Supabase | Set after successful API restore |

---

### 1.6 Queue retry / dead-letter

| Step | Action | Expected |
|------|--------|----------|
| Q1 | Break API (wrong URL) → save view offline | Item `pending` in `vs_cloud_sync_queue_v3` |
| Q2 | Fix API → online | Retries with backoff; `queue_retry` telemetry |
| Q3 | Force 8+ failures | Status `dead_letter`; shown in Telemetry panel |
| Q4 | `requeueDeadLetter` (console) | Item returns to `pending` and replays |
| Q5 | `pauseQueue()` in console | Replay stops; `resumeQueue()` resumes |
| Q6 | Duplicate enqueue same body | Single active item (fingerprint dedupe) |

---

### 1.7 Organization-scoped persistence

| Step | Action | Expected |
|------|--------|----------|
| G1 | User A (Org 1): save filter view “View-A” | Key `vs_saved_views_<org1>` |
| G2 | User B (Org 2) or switch org | Does not see View-A |
| G3 | Same user, legacy key present | `migrateLegacyKey` imports once |
| G4 | Hybrid sync POST | Payload under correct `organization_id` in `hybrid_sync_cache` |
| G5 | Logout → local data | Org resolver falls back to `vs_active_org_id` / default |

---

### 1.8 Telemetry generation

| Step | Action | Expected |
|------|--------|----------|
| T1 | Upload + sync + export + failed restore | Events in `vs_telemetry_<orgId>` |
| T2 | System Health → Telemetry panel | Avg times, queue health, schema trend |
| T3 | 14+ days old events (simulate) | Pruned on next `recordTelemetry` |
| T4 | Daily failure bars | Reflect validation/sync failures |

---

### 1.9 Large workbook performance

| Step | Action | Expected |
|------|--------|----------|
| P1 | ~5k rows, ~30 cols | Completes < 60s on mid laptop; UI responsive |
| P2 | ~10k rows | Warning in validation; acceptable or slow parse |
| P3 | >25 MB file | Blocked at validation |
| P4 | Memory (DevTools Performance) | No runaway growth after 3 import cycles |
| P5 | Filter/export on large set | Deferred filters; export completes |
| P6 | Chart sections | Recharts chunk loads on demand; scroll smooth |

---

## 2. High-risk areas (production)

| Risk | Severity | Why |
|------|----------|-----|
| **API org authorization** | **Critical** | Several routes (`sync-hybrid`, `list-uploads`) use service role and accept client `orgId` without verifying `organization_members`. A crafted request could read/write another org’s data. |
| **No automated tests** | **High** | Zero `*.test.ts` files; regressions likely on refactors. |
| **sessionStorage quota** | **High** | Full workbook in `vs_uploaded_excel_v2`; large imports can throw quota errors (silent fallback to memory-only). |
| **localStorage quota** | **High** | Queue + telemetry + profiles + audit; 5MB limit can break persistence on heavy use. |
| **Interrupted restore** | **Medium** | Marker cleared on recovery but restore not auto-resumed; user may think restore completed. |
| **Dual locking** | **Medium** | In-tab `getSyncLock` + cross-tab lease can confuse debugging; scheduler + manual sync edge cases. |
| **Legacy schema key** | **Medium** | `schemaChangeDetector.ts` still reads `vs_schema_profiles_v1` (unscoped) in one path. |
| **Migration drift** | **Medium** | Docs mention 005; production needs 006–010 applied. |
| **`npm run dev` vs `dev:api`** | **Medium** | Upload/sync APIs 404 without Vercel dev — easy operator mistake. |
| **Service role in browser env** | **Low** | Ensure `SUPABASE_SERVICE_ROLE_KEY` never in `VITE_*` bundle. |
| **Concurrent hydrate + merge** | **Low** | Last-write-wins on hybrid cache may drop local edits if two devices sync. |

---

## 3. Automated test strategy

### 3.1 Tooling (recommended)

```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom msw
```

- **Vitest** — fast, Vite-native
- **MSW** — mock `/api/*` and Supabase REST
- **Playwright** — E2E (separate `e2e/` folder)

### 3.2 Unit tests (highest ROI)

| Module | Cases |
|--------|--------|
| `conflictResolution.ts` | saved_views LWW, append-only audit/risk, schema signature merge |
| `cloudSyncQueue.ts` | dedupe, jitter backoff bounds, dead_letter transition, stale syncing reset |
| `telemetryAggregator.ts` | percentiles, empty events, daily buckets |
| `restoreTransactionManager.ts` | `validateRestorePayload` rejects empty/invalid; rollback restores backup |
| `syncLeaseManager.ts` | stale detection, takeover, owner-only release |
| `orgScopedStorage.ts` | key format, migrateLegacyKey once |

### 3.3 Integration tests

| Flow | Approach |
|------|----------|
| Repository hydrate | Mock `fetch` to `/api/sync-hybrid`; assert merged local state |
| Queue replay | MSW: fail N times then 200; assert status transitions |
| Offline recovery | Call `runOfflineRecovery` with mocked token + queue fixtures |
| persist-upload dedup | Mock Supabase client; same `content_hash` returns existing version |

### 3.4 E2E tests (Playwright)

| Spec | Scope |
|------|--------|
| `excel-upload.spec.ts` | Upload fixture → mapping → dashboard KPI visible |
| `onedrive-sync.spec.ts` | Mock `/api/fetch-workbook` + `/api/persist-upload` |
| `multi-tab.spec.ts` | Two contexts; second tab blocked until lease released |
| `offline-queue.spec.ts` | `context.setOffline(true)` → save view → online → assert API called |

### 3.5 Mocking Supabase + queue

```typescript
// Example: MSW handler
http.post('/api/sync-hybrid', async ({ request }) => {
  const body = await request.json();
  return HttpResponse.json({ ok: true });
});

// Supabase: vi.mock('@supabase/supabase-js') with in-memory auth session
// Or inject SyncContext { organizationId, accessToken } in repository tests
```

**Do not** unit-test `dynamicAnalytics.ts`, `excelParser` core, or risk engine unless fixing a specific bug — per project constraints.

---

## 4. Pre-production optimizations

| Area | Recommendation | Priority |
|------|----------------|----------|
| **Bundle** | Single `AdminDashboardCharts` chunk (348KB) — route-level load only when analytics section opened | P1 |
| **exceljs** | Keep dynamic import; preload on Data Sources tab hover/focus | P2 |
| **Memory** | Cap `rawRows` in session payload for very large sheets (summary mode) | P1 if >10k rows common |
| **Queue** | Periodic `cleanupStaleQueueItems` + purge `synced` remnants; cap dead_letter UI actions | P2 |
| **Compression** | Integration test: round-trip gzip JSON; legacy `.json` path still readable | P1 |
| **Sync races** | Serialize `runOfflineRecovery` + `runSync` via shared mutex; log lease owner in sync runs | P2 |
| **API auth** | Add `assertOrgMember(userId, orgId)` to all service-role routes | **P0** |
| **Hover UX** | Extend hover/focus styles to admin tables, sync buttons, sidebar (currently sparse outside SyncManager) | P3 |

---

## 5. Build warnings — action needed?

| Warning | Action |
|---------|--------|
| **recharts 348KB chunk** | **Defer** if charts lazy-loaded; **fix** by loading charts only on cohort-overview/attendance/etc. sections |
| **exceljs 930KB** | **Accept** for NGO use; **defer** lighter parser unless bundle critical on slow networks |
| **Ineffective dynamic imports** | **Fix** — remove dynamic `hydrateAllRepositories` imports OR stop static re-export from stores (choose one pattern) |
| **Retry loops** | **Monitor** — OneDrive fetch retries 2×; queue up to 8× with jitter; add alert on dead_letter count |
| **localStorage growth** | **Action** — document limits; add “Clear local cache” in System Health; telemetry already prunes 14d |

---

## 6. Production readiness checklist

### Must-fix before release

- [ ] Apply Supabase migrations **006–010**
- [ ] Vercel env: `VITE_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` (server only)
- [ ] **Org membership checks** on all service-role API routes
- [ ] RLS verified on `uploads`, `upload_versions`, `hybrid_sync_cache`, `sync_runs`
- [ ] Run full manual QA §1 on staging with real OneDrive workbook
- [ ] Confirm `npm run dev:api` documented for trainers; production uses Vercel deploy
- [ ] Storage bucket `workbooks` exists with correct policies
- [ ] Auth: at least one `organization_members` row per pilot user

### Safe to defer

- [ ] Cloud telemetry sync (`syncTelemetryToCloud` no-op)
- [ ] Redis/server-side sync lease
- [ ] Full Playwright suite (start with unit tests on queue + restore)
- [ ] exceljs bundle reduction
- [ ] CRDT / multi-device merge
- [ ] Dedicated “dead letter admin” UI (console `requeueDeadLetter` OK for pilot)

### Monitoring requirements

| Signal | Source |
|--------|--------|
| API 5xx rate | Vercel logs |
| `persist-upload` / `fetch-workbook` latency | Vercel + Telemetry panel |
| dead_letter queue count | Telemetry panel + localStorage audit |
| Sync failure rate | `sync_runs.status` + telemetry `sync_duration` |
| Schema drift frequency | telemetry `schema_drift` / `schema_instability` |
| Supabase row growth | `upload_versions`, `audit_logs` |
| Auth failures | Supabase Auth dashboard |

### Rollback strategy

1. **App:** Redeploy previous Vercel build (keep env vars stable).
2. **Data:** Upload versions are immutable — rollback = restore prior `upload_version_id` via Sync Runs UI.
3. **Client:** Users can clear `vs_*` keys in System Health (add button) or hard refresh; session restore from cloud hydrate.
4. **DB:** Do not drop migrations; forward-fix only. Keep migration SQL in repo tagged per release.
5. **OneDrive:** Disable auto-sync via scheduler pause; revert to manual Excel upload if Graph API issues.

---

## Sign-off template

| Role | Date | Build | Notes |
|------|------|-------|-------|
| Dev | | `git sha` | |
| QA | | | Manual §1 complete |
| Program lead | | | Pilot cohort verified |
