import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertOrgAccess,
  handleOrgAccessFailure,
  ORG_READ_ROLES,
  resolveOrganizationIdForUpload,
} from './_lib/assertOrgAccess';
import { createServiceClient } from './_lib/serviceClient';
import { fetchLatestCohortPayloadForOrg, fetchLatestCohortPayloadAny } from './_lib/latestCohortPayload';

const ROUTE = '/api/list-uploads';

async function handleListVersions(req: VercelRequest, res: VercelResponse) {
  const uploadId = req.query.uploadId as string;
  if (!uploadId) return res.status(400).json({ error: 'uploadId required', code: 'bad_request' });

  try {
    const lookupDb = createServiceClient();
    const orgId = await resolveOrganizationIdForUpload(lookupDb, uploadId);

    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: '/api/list-upload-versions',
      requiredRoles: ORG_READ_ROLES,
    });

    const { data, error } = await serviceDb
      .from('upload_versions')
      .select('id, version_number, row_count, created_at, sync_source, schema_signature, workbook_filename')
      .eq('upload_id', uploadId)
      .order('version_number', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ versions: data ?? [] });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, '/api/list-upload-versions')) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}

/** Upload list + version list (rewritten from /api/list-upload-versions on Hobby plan). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const mode = String(req.query.mode ?? '');
  if (mode === 'versions' || req.query.uploadId) {
    return handleListVersions(req, res);
  }

  const orgId = req.query.orgId as string;
  if (!orgId) return res.status(400).json({ error: 'orgId required', code: 'bad_request' });

  if (mode === 'latest-payload') {
    try {
      const serviceDb = createServiceClient();
      const fallback = String(req.query.fallback ?? '') === 'any';
      let result = await fetchLatestCohortPayloadForOrg(serviceDb, orgId);
      if (!result && fallback) {
        result = await fetchLatestCohortPayloadAny(serviceDb);
      }
      if (!result) {
        return res.status(404).json({ error: 'No active upload with stored payload', code: 'not_found' });
      }
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.status(200).json(result);
    } catch (e) {
      const message = (e as Error).message;
      console.error(`[${ROUTE}?mode=latest-payload]`, e);
      if (message.includes('Missing Supabase')) {
        return res.status(503).json({
          error: 'Cloud storage is not configured on the server. Set SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in Vercel.',
          code: 'misconfigured',
        });
      }
      return res.status(500).json({ error: message });
    }
  }

  try {
    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const { data, error } = await serviceDb
      .from('uploads')
      .select('id, file_name, cohort_name, source, row_count, schema_signature, status, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ uploads: data ?? [] });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
