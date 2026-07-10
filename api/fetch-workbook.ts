import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertAuthenticatedForSyncOps, handleOrgAccessFailure } from './_lib/assertOrgAccess.js';

const ROUTE = '/api/fetch-workbook';

function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url).toString('base64');
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    },
  );
  if (!res.ok) throw new Error(`Azure token ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function resolveShare(token: string, shareUrl: string) {
  const encoded = encodeShareUrl(shareUrl.trim());
  const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Graph ${res.status}`);
  }
  return res.json() as Promise<{ id: string; parentReference?: { driveId?: string }; name?: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const missing = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing env: ${missing.join(', ')}` });
  }

  const body = req.body as { fileId?: string; driveId?: string; shareUrl?: string; organizationId?: string };

  try {
    await assertAuthenticatedForSyncOps(req, {
      route: ROUTE,
      organizationId: body.organizationId,
      requiredRoles: ['admin'],
    });

    let fileId = body.fileId;
    let driveId = body.driveId;
    let fileName = 'workbook.xlsx';

    const token = await getGraphToken();

    if (body.shareUrl && (!fileId || !driveId)) {
      const item = await resolveShare(token, body.shareUrl);
      fileId = item.id;
      driveId = item.parentReference?.driveId;
      fileName = item.name ?? fileName;
    }

    if (!fileId || !driveId) {
      return res.status(400).json({ error: 'fileId and driveId required (or shareUrl to resolve)', code: 'bad_request' });
    }

    const contentRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!contentRes.ok) {
      return res.status(contentRes.status).json({ error: `Failed to download workbook: ${contentRes.statusText}` });
    }

    const buffer = Buffer.from(await contentRes.arrayBuffer());
    return res.status(200).json({
      fileName,
      base64: buffer.toString('base64'),
      sizeBytes: buffer.length,
    });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, body.organizationId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }
}
