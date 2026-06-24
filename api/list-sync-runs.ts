import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertOrgAccess, handleOrgAccessFailure, ORG_READ_ROLES } from './_lib/assertOrgAccess';

const ROUTE = '/api/list-sync-runs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orgId = req.query.orgId as string;
  if (!orgId) return res.status(400).json({ error: 'orgId required', code: 'bad_request' });

  try {
    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const { data, error } = await serviceDb
      .from('sync_runs')
      .select(
        'id, organization_id, upload_id, upload_version_id, source, status, started_at, finished_at, duration_ms, rows_processed, schema_changed, warning_count, error_message, insights, health_score, message',
      )
      .eq('organization_id', orgId)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const runs = (data ?? []).map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      uploadId: row.upload_id,
      uploadVersionId: row.upload_version_id,
      source: row.source ?? 'onedrive',
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.finished_at,
      durationMs: row.duration_ms,
      rowsProcessed: row.rows_processed ?? 0,
      schemaChanged: row.schema_changed ?? false,
      warningCount: row.warning_count ?? 0,
      errorMessage: row.error_message,
      insights: Array.isArray(row.insights) ? row.insights : row.message ? [row.message] : [],
      healthScore: row.health_score,
    }));

    return res.status(200).json({ runs });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
