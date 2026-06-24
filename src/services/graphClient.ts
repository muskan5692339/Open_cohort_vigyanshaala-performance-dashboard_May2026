import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type Configuration,
} from '@azure/msal-browser';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.Read', 'User.Read'];

let _msal: PublicClientApplication | null = null;
let _clientId = '';

export async function getMsalInstance(clientId: string, tenantId = 'common'): Promise<PublicClientApplication> {
  if (_msal && _clientId === clientId) return _msal;
  const cfg: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  };
  _msal = new PublicClientApplication(cfg);
  await _msal.initialize();
  _clientId = clientId;
  return _msal;
}

export async function getAccessToken(clientId: string, tenantId = 'common'): Promise<string> {
  const msal = await getMsalInstance(clientId, tenantId);
  const accounts = msal.getAllAccounts();
  try {
    if (accounts.length > 0) {
      const r = await msal.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] });
      return r.accessToken;
    }
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) throw e;
  }
  const r = await msal.acquireTokenPopup({ scopes: SCOPES });
  return r.accessToken;
}

export async function signIn(clientId: string, tenantId = 'common'): Promise<string> {
  const msal = await getMsalInstance(clientId, tenantId);
  const r = await msal.loginPopup({ scopes: SCOPES });
  return r.accessToken;
}

export async function signOut(clientId: string, tenantId = 'common'): Promise<void> {
  const msal = await getMsalInstance(clientId, tenantId);
  const account = msal.getAllAccounts()[0];
  if (account) await msal.logoutPopup({ account });
}

export function isSignedIn(clientId: string): boolean {
  if (!_msal || _clientId !== clientId) return false;
  return _msal.getAllAccounts().length > 0;
}

async function graphFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(`Graph ${res.status}: ${(err as any)?.error?.message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function listWorksheets(
  token: string,
  fileId: string,
  driveId?: string,
): Promise<string[]> {
  const base = driveId
    ? `/drives/${driveId}/items/${fileId}`
    : `/me/drive/items/${fileId}`;
  const data = await graphFetch<{ value: { name: string }[] }>(token, `${base}/workbook/worksheets`);
  return (data.value ?? []).map(ws => ws.name);
}

export async function readSheet(
  token: string,
  fileId: string,
  sheetName: string,
  driveId?: string,
): Promise<string[][]> {
  const base = driveId
    ? `/drives/${driveId}/items/${fileId}`
    : `/me/drive/items/${fileId}`;
  const enc = encodeURIComponent(sheetName);
  const data = await graphFetch<{ values: (string | number | boolean | null)[][] }>(
    token,
    `${base}/workbook/worksheets/${enc}/usedRange`,
  );
  return (data.values ?? []).map(row =>
    row.map(c => (c === null || c === undefined ? '' : String(c).trim())),
  );
}
