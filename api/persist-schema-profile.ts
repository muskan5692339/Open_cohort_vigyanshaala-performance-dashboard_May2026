import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertOrgAccess, handleOrgAccessFailure, ORG_UPLOAD_ROLES } from './_lib/assertOrgAccess.js';

const ROUTE = '/api/persist-schema-profile';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body as {
    organizationId: string;
    fileSignature: string;
    headers: string[];
    mapping: Record<string, unknown>;
    userId?: string;
  };

  if (!body?.organizationId || !body?.fileSignature) {
    return res.status(400).json({ error: 'organizationId and fileSignature required', code: 'bad_request' });
  }

  try {
    const { user, serviceDb } = await assertOrgAccess(req, body.organizationId, {
      route: ROUTE,
      requiredRoles: ORG_UPLOAD_ROLES,
    });

    const { error } = await serviceDb.from('schema_profiles').upsert(
      {
        organization_id: body.organizationId,
        file_signature: body.fileSignature,
        headers: body.headers,
        mapping: body.mapping,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,file_signature' },
    );

    if (error) return res.status(500).json({ error: error.message });

    await serviceDb.from('audit_logs').insert({
      organization_id: body.organizationId,
      event_type: 'mapping_change',
      message: `Saved schema profile ${body.fileSignature}`,
      details: { columns: body.headers.length },
      created_by: user.id,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, body?.organizationId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
