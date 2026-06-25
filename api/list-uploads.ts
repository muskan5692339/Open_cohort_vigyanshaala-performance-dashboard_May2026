import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertOrgAccess, handleOrgAccessFailure, ORG_READ_ROLES } from './_lib/assertOrgAccess';
import { createServiceClient } from './_lib/serviceClient';
import { fetchLatestCohortPayloadForOrg } from './_lib/latestCohortPayload';

const ROUTE = '/api/list-uploads';

/** Public student roster bootstrap — no auth, latest persisted workbook for org. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orgId = req.query.orgId as string;
  if (!orgId) return res.status(400).json({ error: 'orgId required', code: 'bad_request' });

  const mode = String(req.query.mode ?? '');

  if (mode === 'latest-payload') {
    try {
      const serviceDb = createServiceClient();
      const result = await fetchLatestCohortPayloadForOrg(serviceDb, orgId);
      if (!result) {
        return res.status(404).json({ error: 'No active upload with stored payload', code: 'not_found' });
      }
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.status(200).json(result);
    } catch (e) {
      console.error(`[${ROUTE}?mode=latest-payload]`, e);
      return res.status(500).json({ error: (e as Error).message });
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
