import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertOrgAccess,
  assertUploadBelongsToOrg,
  handleOrgAccessFailure,
  ORG_UPLOAD_ROLES,
} from './_lib/assertOrgAccess';

const ROUTE = '/api/persist-sync-run';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const run = req.body as {
    id: string;
    organizationId: string;
    uploadId?: string | null;
    uploadVersionId?: string | null;
    source: string;
    status: string;
    startedAt: string;
    completedAt?: string | null;
    durationMs?: number | null;
    rowsProcessed: number;
    schemaChanged: boolean;
    warningCount: number;
    errorMessage?: string | null;
    insights?: string[];
    healthScore?: string | null;
    workbookFilename?: string | null;
    schemaSignature?: string | null;
  };

  if (!run?.organizationId || !run?.id) {
    return res.status(400).json({ error: 'organizationId and id required', code: 'bad_request' });
  }

  try {
    const { serviceDb } = await assertOrgAccess(req, run.organizationId, {
      route: ROUTE,
      requiredRoles: ORG_UPLOAD_ROLES,
    });

    if (run.uploadId) {
      await assertUploadBelongsToOrg(serviceDb, run.uploadId, run.organizationId);
    }

    const { error } = await serviceDb.from('sync_runs').upsert(
      {
        id: run.id.startsWith('sync-') ? undefined : run.id,
        organization_id: run.organizationId,
        upload_id: run.uploadId ?? null,
        upload_version_id: run.uploadVersionId ?? null,
        source: run.source,
        status: run.status,
        message: run.insights?.[0] ?? null,
        started_at: run.startedAt,
        finished_at: run.completedAt ?? new Date().toISOString(),
        duration_ms: run.durationMs ?? null,
        rows_processed: run.rowsProcessed,
        schema_changed: run.schemaChanged,
        warning_count: run.warningCount,
        error_message: run.errorMessage ?? null,
        insights: run.insights ?? [],
        health_score: run.healthScore ?? null,
      },
      { onConflict: 'id', ignoreDuplicates: false },
    );

    if (error) {
      const { data, error: insertErr } = await serviceDb
        .from('sync_runs')
        .insert({
          organization_id: run.organizationId,
          upload_id: run.uploadId ?? null,
          upload_version_id: run.uploadVersionId ?? null,
          source: run.source,
          status: run.status,
          message: run.insights?.[0] ?? null,
          started_at: run.startedAt,
          finished_at: run.completedAt ?? new Date().toISOString(),
          duration_ms: run.durationMs ?? null,
          rows_processed: run.rowsProcessed,
          schema_changed: run.schemaChanged,
          warning_count: run.warningCount,
          error_message: run.errorMessage ?? null,
          insights: run.insights ?? [],
          health_score: run.healthScore ?? null,
        })
        .select('id')
        .single();
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      return res.status(200).json({ id: data.id });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, run?.organizationId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
