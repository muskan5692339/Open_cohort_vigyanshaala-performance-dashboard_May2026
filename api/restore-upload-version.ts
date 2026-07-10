import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gunzipSync } from 'zlib';
import {
  assertOrgAccess,
  handleOrgAccessFailure,
  OrgAccessError,
  ORG_READ_ROLES,
  resolveOrganizationIdForVersion,
} from './_lib/assertOrgAccess.js';
import { createServiceClient } from './_lib/serviceClient.js';

const ROUTE = '/api/restore-upload-version';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const versionId = req.query.versionId as string;
  if (!versionId) return res.status(400).json({ error: 'versionId required', code: 'bad_request' });

  try {
    const lookupDb = createServiceClient();
    const orgId = await resolveOrganizationIdForVersion(lookupDb, versionId);

    const { user, serviceDb: sb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const { data: version, error: vErr } = await sb
      .from('upload_versions')
      .select(
        'id, upload_id, payload_storage_path, payload_compressed, sheet_name, row_count, schema_signature, changed_columns, sync_source, created_at, uploads(file_name, cohort_name, organization_id)',
      )
      .eq('id', versionId)
      .maybeSingle();

    if (vErr || !version) return res.status(404).json({ error: 'Version not found', code: 'bad_request' });

    const uploadMeta = version.uploads as { file_name?: string; cohort_name?: string; organization_id?: string } | null;
    if (uploadMeta?.organization_id && uploadMeta.organization_id !== orgId) {
      throw new OrgAccessError(403, 'forbidden', 'Version does not belong to this organization', 'forbidden_org_access');
    }

    const path = version.payload_storage_path;
    if (!path) return res.status(404).json({ error: 'No stored payload for this version' });

    const { data: blob, error: sErr } = await sb.storage.from('workbooks').download(path);
    if (sErr || !blob) return res.status(500).json({ error: sErr?.message ?? 'Download failed' });

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const compressed = Boolean(version.payload_compressed) || path.endsWith('.gz') || buffer[0] === 0x1f;
    const text = compressed ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');

    const stored = JSON.parse(text) as {
      headers: string[];
      rawRows: Record<string, string>[];
      mapping: Record<string, unknown>;
      discoveredColumns: unknown[];
      cohortName: string;
      fileName: string;
    };

    const restoredAt = new Date().toISOString();

    if (version.upload_id) {
      await sb
        .from('uploads')
        .update({
          restored_from_version_id: version.id,
          restored_at: restoredAt,
          restored_by: user.id,
        })
        .eq('id', version.upload_id);
    }

    await sb.from('audit_logs').insert({
      organization_id: orgId,
      event_type: 'upload',
      message: `Restored upload version ${version.id}`,
      details: {
        versionId: version.id,
        uploadId: version.upload_id,
        restoredFromVersionId: version.id,
        restoredAt,
      },
      created_by: user.id,
    });

    return res.status(200).json({
      versionId: version.id,
      uploadId: version.upload_id,
      payload: {
        cohortName: stored.cohortName ?? uploadMeta?.cohort_name ?? 'Restored',
        fileName: stored.fileName ?? uploadMeta?.file_name ?? 'workbook.xlsx',
        students: [],
        attendance: [],
        assignments: [],
        quiz: [],
        rawRows: stored.rawRows,
        headers: stored.headers,
        discoveredColumns: stored.discoveredColumns,
        mapping: stored.mapping,
      },
      meta: {
        sheetName: version.sheet_name,
        rowCount: version.row_count,
        schemaSignature: version.schema_signature,
        restoredAt,
        restoredFromVersionId: version.id,
        restoredBy: user.id,
      },
    });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
