import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertOrgAccess,
  handleOrgAccessFailure,
  ORG_HYBRID_WRITE_ROLES,
  ORG_READ_ROLES,
} from './assertOrgAccess.js';
import { createServiceClient } from './serviceClient.js';
import { resolveTelemetryOrgId } from './studentPortalTelemetry.js';
import { randomUUID } from 'crypto';

const ROUTE = '/api/student-engagement?resource=profile-corrections';
const BUCKET = 'student-roster-public';

export type ProfileCorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface ProfileCorrectionDto {
  id: string;
  email: string;
  studentName: string;
  submittedAt: string;
  status: ProfileCorrectionStatus;
  fields: {
    phone?: string;
    college?: string;
    course?: string;
    year?: string;
  };
  adminNote?: string;
  reviewedAt?: string;
}

interface StoreFile {
  updatedAt: string;
  items: ProfileCorrectionDto[];
}

function parseBody(req: VercelRequest): Record<string, unknown> | null {
  let raw: unknown = req.body;
  if (Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
  } else if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function cleanField(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().slice(0, max);
  return t || undefined;
}

function storagePath(orgId: string): string {
  return `${orgId}/profile-corrections.json`;
}

async function readStore(orgId: string): Promise<StoreFile> {
  const serviceDb = createServiceClient();
  const { data, error } = await serviceDb.storage.from(BUCKET).download(storagePath(orgId));
  if (error || !data) {
    return { updatedAt: new Date().toISOString(), items: [] };
  }
  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as StoreFile;
    if (!parsed || !Array.isArray(parsed.items)) {
      return { updatedAt: new Date().toISOString(), items: [] };
    }
    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      items: parsed.items,
    };
  } catch {
    return { updatedAt: new Date().toISOString(), items: [] };
  }
}

async function writeStore(orgId: string, store: StoreFile): Promise<void> {
  const serviceDb = createServiceClient();
  const payload = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const blob = Buffer.from(JSON.stringify(payload), 'utf8');
  const { error } = await serviceDb.storage.from(BUCKET).upload(storagePath(orgId), blob, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

function counts(items: ProfileCorrectionDto[]) {
  return {
    pendingCount: items.filter(i => i.status === 'pending').length,
    approvedCount: items.filter(i => i.status === 'approved').length,
    rejectedCount: items.filter(i => i.status === 'rejected').length,
  };
}

/** Student portal — no auth; writes into default org store. */
export async function handleProfileCorrectionPost(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(req);
  const email = cleanField(body?.email)?.toLowerCase();
  const studentName = cleanField(body?.studentName, 160) || 'Student';
  const rawFields = (body?.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>;
  const fields = {
    phone: cleanField(rawFields.phone),
    college: cleanField(rawFields.college, 300),
    course: cleanField(rawFields.course),
    year: cleanField(rawFields.year, 80),
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid student email required' });
  }
  if (!fields.phone && !fields.college && !fields.course && !fields.year) {
    return res.status(400).json({ error: 'At least one field is required' });
  }

  try {
    const organizationId = resolveTelemetryOrgId();
    const store = await readStore(organizationId);
    const withoutPending = store.items.filter(
      c => !(c.email.toLowerCase() === email && c.status === 'pending'),
    );
    const item: ProfileCorrectionDto = {
      id: randomUUID(),
      email,
      studentName,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      fields,
    };
    await writeStore(organizationId, {
      updatedAt: new Date().toISOString(),
      items: [item, ...withoutPending].slice(0, 2000),
    });
    return res.status(200).json({ ok: true, item });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('Missing Supabase')) {
      return res.status(503).json({ error: 'Cloud not configured', code: 'misconfigured' });
    }
    return res.status(500).json({ error: message });
  }
}

/** Admin list — auth required. */
export async function handleProfileCorrectionGet(req: VercelRequest, res: VercelResponse) {
  const orgId = String(req.query.orgId ?? '');
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  try {
    await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const status = String(req.query.status ?? 'all');
    const store = await readStore(orgId);
    const sorted = [...store.items].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const items =
      status === 'pending' || status === 'approved' || status === 'rejected'
        ? sorted.filter(i => i.status === status)
        : sorted;

    // Counts always from full store so tabs stay accurate when filtered.
    const allCounts = counts(store.items);

    return res.status(200).json({
      items,
      ...allCounts,
      tableReady: true,
    });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return;
    return res.status(500).json({ error: (e as Error).message || 'Failed to load student updates' });
  }
}

/** Admin approve / reject — auth required. */
export async function handleProfileCorrectionPatch(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(req);
  const orgId = cleanField(body?.orgId) || String(req.query.orgId ?? '');
  const id = cleanField(body?.id);
  const status = cleanField(body?.status) as ProfileCorrectionStatus | undefined;
  const adminNote = cleanField(body?.adminNote, 500);

  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  if (!id) return res.status(400).json({ error: 'id required' });
  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  try {
    await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_HYBRID_WRITE_ROLES,
    });

    const store = await readStore(orgId);
    const idx = store.items.findIndex(c => c.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Request not found' });

    store.items[idx] = {
      ...store.items[idx],
      status,
      adminNote: adminNote || store.items[idx].adminNote,
      reviewedAt: new Date().toISOString(),
    };
    await writeStore(orgId, store);
    return res.status(200).json({ ok: true, item: store.items[idx] });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return;
    return res.status(500).json({ error: (e as Error).message || 'Failed to review request' });
  }
}

export async function handleProfileCorrections(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') return handleProfileCorrectionPost(req, res);
  if (req.method === 'GET') return handleProfileCorrectionGet(req, res);
  if (req.method === 'PATCH') return handleProfileCorrectionPatch(req, res);
  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
