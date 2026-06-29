import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import {
  assertOrgAccess,
  assertUploadBelongsToOrg,
  handleOrgAccessFailure,
  ORG_UPLOAD_ROLES,
} from './_lib/assertOrgAccess';

const ROUTE = '/api/persist-upload';

function hashPayload(json: string): string {
  return createHash('sha256').update(json).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as {
    organizationId: string;
    userId?: string;
    fileName: string;
    cohortName: string;
    source: 'excel' | 'onedrive' | 'demo';
    schemaSignature?: string;
    sheetName?: string;
    rowCount: number;
    changedColumns?: unknown[];
    headers?: string[];
    rawRows?: Record<string, string>[];
    mapping?: Record<string, unknown>;
    discoveredColumns?: unknown[];
    existingUploadId?: string;
    syncRunId?: string;
  };

  if (!body?.organizationId || !body?.fileName) {
    return res.status(400).json({ error: 'organizationId and fileName required', code: 'bad_request' });
  }

  try {
    const { user, serviceDb } = await assertOrgAccess(req, body.organizationId, {
      route: ROUTE,
      requiredRoles: ORG_UPLOAD_ROLES,
    });

    const createdBy = user.id;
    let uploadId = body.existingUploadId;

    if (uploadId) {
      await assertUploadBelongsToOrg(serviceDb, uploadId, body.organizationId);
      await serviceDb
        .from('uploads')
        .update({
          row_count: body.rowCount ?? 0,
          schema_signature: body.schemaSignature ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uploadId);
    } else {
      const { data: upload, error: uploadErr } = await serviceDb
        .from('uploads')
        .insert({
          organization_id: body.organizationId,
          file_name: body.fileName,
          cohort_name: body.cohortName,
          source: body.source,
          schema_signature: body.schemaSignature ?? null,
          row_count: body.rowCount ?? 0,
          status: 'active',
          created_by: createdBy,
        })
        .select('id')
        .single();

      if (uploadErr || !upload) {
        return res.status(500).json({ error: uploadErr?.message ?? 'Upload insert failed' });
      }
      uploadId = upload.id;
    }

    const hasPayload = Boolean(body.rawRows?.length && body.headers?.length);
    let contentHash: string | null = null;
    let payloadPath: string | null = null;
    let payloadCompressed = false;

    if (hasPayload && body.rawRows && body.headers) {
      const payloadObj = {
        headers: body.headers,
        rawRows: body.rawRows,
        mapping: body.mapping ?? {},
        discoveredColumns: body.discoveredColumns ?? [],
        classWiseAttendance: body.classWiseAttendance ?? [],
        classWiseAttendanceColumns: body.classWiseAttendanceColumns ?? [],
        cohortName: body.cohortName,
        fileName: body.fileName,
      };
      const json = JSON.stringify(payloadObj);
      contentHash = hashPayload(json);

      const { data: duplicate } = await serviceDb
        .from('upload_versions')
        .select('id, version_number, upload_id')
        .eq('upload_id', uploadId)
        .eq('content_hash', contentHash)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        return res.status(200).json({
          uploadId,
          versionId: duplicate.id,
          versionNumber: duplicate.version_number,
          deduplicated: true,
        });
      }

      const { data: latestVersion } = await serviceDb
        .from('upload_versions')
        .select('version_number')
        .eq('upload_id', uploadId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const versionNumber = (latestVersion?.version_number ?? 0) + 1;
      payloadPath = `workbooks/${body.organizationId}/${uploadId}/v${versionNumber}.json.gz`;
      const compressed = gzipSync(Buffer.from(json, 'utf8'));
      payloadCompressed = true;

      await serviceDb.storage.from('workbooks').upload(payloadPath, compressed, {
        contentType: 'application/gzip',
        upsert: true,
      });

      const publicPaths = [
        `${body.organizationId}/latest.json.gz`,
        'latest.json.gz',
      ];
      for (const publicPath of publicPaths) {
        const { error: pubErr } = await serviceDb.storage
          .from('student-roster-public')
          .upload(publicPath, compressed, { contentType: 'application/gzip', upsert: true });
        if (pubErr) {
          console.warn('[persist-upload] public roster mirror', publicPath, pubErr.message);
        }
      }

      const { data: version, error: versionErr } = await serviceDb
        .from('upload_versions')
        .insert({
          upload_id: uploadId,
          version_number: versionNumber,
          sheet_name: body.sheetName ?? null,
          row_count: body.rowCount ?? 0,
          schema_signature: body.schemaSignature ?? null,
          changed_columns: body.changedColumns ?? [],
          sync_source: body.source === 'onedrive' ? 'onedrive' : body.source === 'demo' ? 'demo' : 'manual',
          payload_storage_path: payloadPath,
          sync_run_id: body.syncRunId ?? null,
          workbook_filename: body.fileName,
          content_hash: contentHash,
          payload_compressed: payloadCompressed,
          created_by: createdBy,
        })
        .select('id')
        .single();

      if (versionErr || !version) {
        return res.status(500).json({ error: versionErr?.message ?? 'Version insert failed' });
      }

      if (body.schemaSignature && body.mapping && body.headers) {
        await serviceDb.from('schema_profiles').upsert(
          {
            organization_id: body.organizationId,
            file_signature: body.schemaSignature,
            headers: body.headers,
            mapping: body.mapping,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,file_signature' },
        );
      }

      await serviceDb.from('audit_logs').insert({
        organization_id: body.organizationId,
        event_type: 'upload',
        message: `Persisted upload ${body.fileName}`,
        details: { uploadId, versionId: version.id, rowCount: body.rowCount, versionNumber, contentHash },
        created_by: createdBy,
      });

      return res.status(200).json({ uploadId, versionId: version.id, versionNumber, contentHash });
    }

    const { data: latestVersion } = await serviceDb
      .from('upload_versions')
      .select('version_number')
      .eq('upload_id', uploadId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const versionNumber = (latestVersion?.version_number ?? 0) + 1;

    const { data: version, error: versionErr } = await serviceDb
      .from('upload_versions')
      .insert({
        upload_id: uploadId,
        version_number: versionNumber,
        sheet_name: body.sheetName ?? null,
        row_count: body.rowCount ?? 0,
        schema_signature: body.schemaSignature ?? null,
        changed_columns: body.changedColumns ?? [],
        sync_source: body.source === 'onedrive' ? 'onedrive' : body.source === 'demo' ? 'demo' : 'manual',
        payload_storage_path: payloadPath,
        sync_run_id: body.syncRunId ?? null,
        workbook_filename: body.fileName,
        content_hash: contentHash,
        payload_compressed: payloadCompressed,
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (versionErr || !version) {
      return res.status(500).json({ error: versionErr?.message ?? 'Version insert failed' });
    }

    if (body.schemaSignature && body.mapping && body.headers) {
      await serviceDb.from('schema_profiles').upsert(
        {
          organization_id: body.organizationId,
          file_signature: body.schemaSignature,
          headers: body.headers,
          mapping: body.mapping,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,file_signature' },
      );
    }

    await serviceDb.from('audit_logs').insert({
      organization_id: body.organizationId,
      event_type: 'upload',
      message: `Persisted upload ${body.fileName}`,
      details: { uploadId, versionId: version.id, rowCount: body.rowCount, versionNumber },
      created_by: createdBy,
    });

    return res.status(200).json({ uploadId, versionId: version.id, versionNumber });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, body?.organizationId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
