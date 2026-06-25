import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gunzipSync } from 'zlib';
import { createServiceClient } from './_lib/serviceClient';

const ROUTE = '/api/latest-cohort-payload';

/** Public read of the latest persisted cohort workbook for student email lookup (no auth). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orgId = req.query.orgId as string;
  if (!orgId) return res.status(400).json({ error: 'orgId required', code: 'bad_request' });

  try {
    const db = createServiceClient();

    const { data: upload, error: uploadErr } = await db
      .from('uploads')
      .select('id, file_name, cohort_name')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });
    if (!upload) return res.status(404).json({ error: 'No active upload for organization', code: 'not_found' });

    const { data: version, error: vErr } = await db
      .from('upload_versions')
      .select('payload_storage_path, payload_compressed, row_count')
      .eq('upload_id', upload.id)
      .not('payload_storage_path', 'is', null)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vErr) return res.status(500).json({ error: vErr.message });
    if (!version?.payload_storage_path) {
      return res.status(404).json({ error: 'No stored payload for latest upload', code: 'not_found' });
    }

    const { data: blob, error: sErr } = await db.storage.from('workbooks').download(version.payload_storage_path);
    if (sErr || !blob) return res.status(500).json({ error: sErr?.message ?? 'Download failed' });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const compressed =
      Boolean(version.payload_compressed)
      || version.payload_storage_path.endsWith('.gz')
      || buffer[0] === 0x1f;
    const text = compressed ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');

    const stored = JSON.parse(text) as {
      headers: string[];
      rawRows: Record<string, string>[];
      mapping: Record<string, unknown>;
      discoveredColumns: unknown[];
      cohortName: string;
      fileName: string;
    };

    if (!stored.rawRows?.length) {
      return res.status(404).json({ error: 'Stored payload has no rows', code: 'not_found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return res.status(200).json({
      payload: {
        cohortName: stored.cohortName ?? upload.cohort_name ?? 'Cohort',
        fileName: stored.fileName ?? upload.file_name ?? 'workbook.xlsx',
        students: [],
        attendance: [],
        assignments: [],
        quiz: [],
        rawRows: stored.rawRows,
        headers: stored.headers ?? [],
        discoveredColumns: stored.discoveredColumns,
        mapping: stored.mapping ?? {},
      },
      meta: {
        fileName: stored.fileName ?? upload.file_name ?? 'workbook.xlsx',
        cohortName: stored.cohortName ?? upload.cohort_name ?? 'Cohort',
        loadedAt: new Date().toISOString(),
        studentCount: stored.rawRows.length,
        source: 'cloud',
      },
    });
  } catch (e) {
    console.error(`[${ROUTE}]`, e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
