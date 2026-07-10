import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertAuthenticatedForSyncOps, handleOrgAccessFailure } from './_lib/assertOrgAccess.js';

const ROUTE = '/api/resolve-share';
const DEV = process.env.NODE_ENV !== 'production';

/* ── Share URL → Graph encoded token ───────────────────────
   Microsoft spec:
     1. base64-encode the full URL
     2. strip trailing '='
     3. replace '/' with '_', '+' with '-'
     4. prefix with 'u!'
   ────────────────────────────────────────────────────────── */
function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url).toString('base64');
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

/* ── Client-credentials token ───────────────────────────── */
async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.AZURE_TENANT_ID!;
  const clientId     = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    if (DEV) console.error('[resolve-share] token error:', err);
    throw new Error(
      `Azure token ${res.status}: ${err.error_description ?? err.error ?? res.statusText}`,
    );
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/* ── Human-readable error messages ─────────────────────── */
function friendlyError(status: number, code: string, message: string): string {
  if (status === 400) return `Invalid sharing URL — the URL could not be decoded by Microsoft Graph. Make sure you copied the full sharing link from OneDrive (Share → Copy link). Raw: ${message}`;
  if (status === 401) return `Authentication failed. Check that AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are set correctly in your environment variables. Raw: ${message}`;
  if (status === 403) return `Access denied (${code}). Ensure the Azure app has "Files.Read.All" Application permission with admin consent granted. Raw: ${message}`;
  if (status === 404) return `File not found. The sharing link may have expired or the file was moved. Try generating a new share link. Raw: ${message}`;
  return `Graph API error ${status} (${code}): ${message}`;
}

/* ── Handler ────────────────────────────────────────────── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const missing = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({
      error: `Missing server environment variables: ${missing.join(', ')}. Set them in Vercel → Project → Settings → Environment Variables.`,
    });
  }

  const body = req.body as { shareUrl?: string; organizationId?: string };
  if (!body.shareUrl?.trim()) {
    return res.status(400).json({ error: 'shareUrl is required in the request body.', code: 'bad_request' });
  }

  try {
    await assertAuthenticatedForSyncOps(req, {
      route: ROUTE,
      organizationId: body.organizationId,
      requiredRoles: ['admin'],
    });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, body.organizationId)) return;
    return res.status(500).json({ error: (e as Error).message });
  }

  const encoded = encodeShareUrl(body.shareUrl.trim());
  if (DEV) console.log('[resolve-share] shareUrl:', body.shareUrl);
  if (DEV) console.log('[resolve-share] encoded:', encoded);

  try {
    const token = await getGraphToken();

    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const body = await graphRes.json() as Record<string, unknown>;
    if (DEV) console.log('[resolve-share] Graph response:', JSON.stringify(body, null, 2));

    if (!graphRes.ok) {
      const errObj = (body as { error?: { code?: string; message?: string } }).error ?? {};
      const code    = errObj.code    ?? '';
      const message = errObj.message ?? graphRes.statusText;
      return res.status(graphRes.status).json({
        error: friendlyError(graphRes.status, code, message),
        code,
        ...(DEV ? { raw: body, encodedShare: encoded } : {}),
      });
    }

    const item = body as {
      id: string;
      name?: string;
      webUrl?: string;
      parentReference?: { driveId?: string };
    };

    return res.status(200).json({
      fileId:        item.id,
      driveId:       item.parentReference?.driveId ?? '',
      name:          item.name ?? '',
      webUrl:        item.webUrl ?? '',
      encodedShare:  encoded,
      ...(DEV ? { raw: body } : {}),
    });
  } catch (err) {
    if (DEV) console.error('[resolve-share] caught:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
