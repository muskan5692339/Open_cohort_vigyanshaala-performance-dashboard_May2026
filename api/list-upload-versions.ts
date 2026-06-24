import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertOrgAccess,
  handleOrgAccessFailure,
  ORG_READ_ROLES,
  resolveOrganizationIdForUpload,
} from './_lib/assertOrgAccess';
import { createServiceClient } from './_lib/serviceClient';

const ROUTE = '/api/list-upload-versions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const uploadId = req.query.uploadId as string;
  if (!uploadId) return res.status(400).json({ error: 'uploadId required', code: 'bad_request' });

  try {
    const lookupDb = createServiceClient();
    const orgId = await resolveOrganizationIdForUpload(lookupDb, uploadId);

    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
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
    if (await handleOrgAccessFailure(res, e, req, ROUTE)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
