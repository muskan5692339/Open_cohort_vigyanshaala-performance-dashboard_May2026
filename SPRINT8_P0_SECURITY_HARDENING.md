# Sprint 8 — P0 Multi-Tenant Security Hardening

## Summary

Centralized org-membership authorization runs **before** any service-role Supabase access on Sprint 8 hybrid/upload/sync API routes. Client-supplied `organizationId` values are never trusted without a matching active row in `organization_members`.

## Core library

| File | Role |
|------|------|
| `api/_lib/assertOrgAccess.ts` | JWT validation, membership lookup, role checks, typed `OrgAccessError` |
| `api/_lib/serviceClient.ts` | `createAnonAuthClient()` (JWT only), `createServiceClient()` (post-auth) |
| `api/_lib/securityTelemetry.ts` | `unauthorized_org_access` / `forbidden_org_access` → `audit_logs` (no tokens in logs) |

### Role gates

| Operation | Roles |
|-----------|--------|
| List / read / hybrid GET / restore | `admin`, `program_manager`, `viewer` |
| Hybrid POST | `admin`, `program_manager` |
| persist-upload, persist-sync-run, persist-schema-profile | `admin` |
| fetch-workbook, resolve-share | Authenticated `admin` (org-scoped when `organizationId` provided) |

## Protected API routes (org membership enforced)

| Route | Auth helper | Notes |
|-------|-------------|--------|
| `GET/POST /api/sync-hybrid` | `assertOrgAccess` | Read vs hybrid-write roles |
| `POST /api/persist-upload` | `assertOrgAccess` | Validates `existingUploadId` belongs to org |
| `GET /api/list-uploads` | `assertOrgAccess` | Query `organizationId` |
| `GET /api/list-upload-versions` | `assertOrgAccess` | Resolves org from upload |
| `GET /api/restore-upload-version` | `assertOrgAccess` | Resolves org from version |
| `POST /api/persist-sync-run` | `assertOrgAccess` | Body `organizationId` |
| `GET /api/list-sync-runs` | `assertOrgAccess` | Query `organizationId` |
| `POST /api/persist-schema-profile` | `assertOrgAccess` | Body `organizationId` |
| `POST /api/fetch-workbook` | `assertAuthenticatedForSyncOps` | Admin; optional org scope |
| `POST /api/resolve-share` | `assertAuthenticatedForSyncOps` | Admin; optional org scope |

### Client callers updated to send `Authorization: Bearer <session>`

- `src/services/cloud/uploadPersistence.ts`
- `src/repositories/repositoryCloudSync.ts`
- `src/services/syncRunStore.ts`
- `src/services/cloudWorkbookFetcher.ts`
- `src/hooks/useOneDriveOrchestrator.ts`
- `src/components/datasource/OneDriveSync.tsx`
- `src/components/dashboard/admin/SyncConfig.tsx`

## Routes still using service role without org membership (remaining risk)

| Route | Risk | Recommendation |
|-------|------|----------------|
| `POST /api/upload-sync` | Legacy cohort upsert; no JWT/org check | Deprecate or add `assertOrgAccess` + org model |
| `POST /api/sync` | Legacy OneDrive → Supabase; env secrets only | Same; restrict to cron/internal secret or add auth |

These are **out of scope** for Sprint 8 hybrid paths but remain the highest gap if still deployed publicly.

## RLS (direct anon/authenticated client access)

Migrations `007_sprint8_rls.sql` and `009_sprint8_phase4_hybrid.sql` enable RLS on:

- `organizations`, `organization_members`
- `uploads`, `upload_versions`
- `sync_runs`, `hybrid_sync_cache`
- `schema_profiles`, `audit_logs` (where applicable)

Helpers: `user_org_ids()`, `user_has_org_role()`.

**Service role bypasses RLS** — API routes must use `assertOrgAccess` (implemented for routes above).

### Storage (`011_storage_workbooks_rls.sql`)

- Bucket `workbooks` (private)
- Authenticated SELECT/INSERT/UPDATE scoped to first path segment = org UUID via `user_org_ids()`
- Writes require `admin` role on that org

Apply migration in Supabase before relying on storage policies in production.

## Automated tests

```bash
npm test
```

`api/_lib/assertOrgAccess.test.ts` — 401 (no/invalid token), 403 (non-member, wrong org, insufficient role), authorized member success.

## Build verification

```bash
npm run build
```

Last run: **passed** (client bundle unchanged in scope).

## Production blockers (post-P0)

1. **Apply migrations** `007`, `009`, `011` on production Supabase if not already applied.
2. **Harden or disable** `upload-sync` and `sync` if exposed on Vercel without additional auth.
3. **Ensure all UI paths** call protected APIs with session Bearer (audit any direct `fetch('/api/...')` without auth).
4. **Rotate** `SUPABASE_SERVICE_ROLE_KEY` only on server; never expose to client.
5. **Azure app permissions** for OneDrive routes remain server-side; org auth prevents unauthenticated Graph proxy abuse.
6. **Rate limiting** / WAF on API routes (not implemented).
7. **npm audit** high-severity deps (informational from last install).

## Error response shape

```json
{ "error": "human message", "code": "unauthorized" | "forbidden" | "bad_request" | "misconfigured" }
```

HTTP status: 401 / 403 / 400 / 503 per `OrgAccessError`.
