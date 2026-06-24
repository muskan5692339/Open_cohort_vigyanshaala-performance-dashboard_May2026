import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertOrgAccess,
  handleOrgAccessFailure,
  ORG_HYBRID_WRITE_ROLES,
  ORG_READ_ROLES,
} from './_lib/assertOrgAccess';

const ALLOWED = new Set(['saved_views', 'risk_actions', 'audit_logs', 'schema_profiles', 'upload_snapshots']);
const ROUTE = '/api/sync-hybrid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const orgId = req.query.orgId as string;
      const entityType = req.query.entityType as string;
      if (!orgId || !entityType || !ALLOWED.has(entityType)) {
        return res.status(400).json({ error: 'orgId and valid entityType required', code: 'bad_request' });
      }

      const { serviceDb } = await assertOrgAccess(req, orgId, {
        route: ROUTE,
        requiredRoles: ORG_READ_ROLES,
      });

      const { data, error } = await serviceDb
        .from('hybrid_sync_cache')
        .select('payload, updated_at')
        .eq('organization_id', orgId)
        .eq('entity_type', entityType)
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ payload: data?.payload ?? [], updatedAt: data?.updated_at ?? null });
    }

    if (req.method === 'POST') {
      const body = req.body as {
        organizationId: string;
        entityType: string;
        payload: unknown[];
        userId?: string;
      };

      if (!body?.organizationId || !body?.entityType || !ALLOWED.has(body.entityType)) {
        return res.status(400).json({ error: 'organizationId and valid entityType required', code: 'bad_request' });
      }

      const { user, serviceDb } = await assertOrgAccess(req, body.organizationId, {
        route: ROUTE,
        requiredRoles: ORG_HYBRID_WRITE_ROLES,
      });

      const { error } = await serviceDb.from('hybrid_sync_cache').upsert(
        {
          organization_id: body.organizationId,
          entity_type: body.entityType,
          payload: body.payload ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,entity_type' },
      );

      if (error) return res.status(500).json({ error: error.message });

      await serviceDb.from('audit_logs').insert({
        organization_id: body.organizationId,
        event_type: 'sync',
        message: `Hybrid sync: ${body.entityType}`,
        details: { count: Array.isArray(body.payload) ? body.payload.length : 0 },
        created_by: user.id,
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, (req.body as { organizationId?: string })?.organizationId ?? (req.query.orgId as string))) {
      return;
    }
    return res.status(500).json({ error: (e as Error).message });
  }
}
