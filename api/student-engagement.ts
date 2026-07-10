import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertOrgAccess, handleOrgAccessFailure, ORG_READ_ROLES } from './_lib/assertOrgAccess.js';
import { createServiceClient } from './_lib/serviceClient.js';
import {
  aggregatePortalStats,
  eventNameForPortalType,
  isStudentPortalPath,
  PORTAL_EVENTS,
  resolveTelemetryOrgId,
  type TelemetryRow,
} from './_lib/studentPortalTelemetry.js';

const ROUTE = '/api/student-engagement';

interface PostBody {
  orgId?: string;
  type: 'page_view' | 'session_pulse';
  sessionId: string;
  path: string;
  studentEmail?: string;
  clickCount?: number;
  activeMs?: number;
  isFinal?: boolean;
}

function emptyStats(days: number, since: string) {
  return {
    days,
    since,
    totalClicks: 0,
    totalActiveMs: 0,
    totalViews: 0,
    uniqueStudents: 0,
    sessionCount: 0,
    avgTimePerStudentMs: 0,
    avgTimePerSessionMs: 0,
    studentBreakdown: [] as {
      email: string;
      clicks: number;
      activeMs: number;
      sessions: number;
      views: number;
      avgSessionMs: number;
    }[],
    telemetryReady: false,
  };
}

function isTelemetryTableMissing(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('telemetry_events') && (m.includes('does not exist') || m.includes('not found') || m.includes('schema cache'));
}

function parsePostBody(req: VercelRequest): PostBody | null {
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
  return raw as PostBody;
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = parsePostBody(req);
  if (!body?.sessionId || !body?.type || !body?.path) {
    return res.status(400).json({ error: 'sessionId, type, and path required' });
  }
  if (!isStudentPortalPath(body.path)) {
    return res.status(400).json({ error: 'Only student portal paths are tracked' });
  }

  try {
    const serviceDb = createServiceClient();
    const organizationId = resolveTelemetryOrgId();
    const email = typeof body.studentEmail === 'string' ? body.studentEmail.trim().toLowerCase().slice(0, 200) : null;
    const { error } = await serviceDb.from('telemetry_events').insert({
      organization_id: organizationId,
      event_name: eventNameForPortalType(body.type),
      duration_ms: body.type === 'session_pulse' ? Math.max(0, Math.round(body.activeMs ?? 0)) : null,
      metadata: {
        sessionId: body.sessionId.slice(0, 80),
        path: body.path.slice(0, 120),
        studentEmail: email,
        clickCount: Math.max(0, Math.round(body.clickCount ?? 0)),
        isFinal: Boolean(body.isFinal),
      },
    });
    if (error) {
      if (isTelemetryTableMissing(error.message)) {
        return res.status(200).json({ ok: true, telemetryReady: false });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, telemetryReady: true });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('Missing Supabase')) {
      return res.status(503).json({ error: 'Cloud telemetry not configured', code: 'misconfigured' });
    }
    return res.status(500).json({ error: message });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const orgId = String(req.query.orgId ?? '');
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { serviceDb, membership } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const { data, error } = await serviceDb
      .from('telemetry_events')
      .select('event_name, duration_ms, metadata, created_at')
      .eq('organization_id', membership.organization_id)
      .in('event_name', [...PORTAL_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      if (isTelemetryTableMissing(error.message)) {
        return res.status(200).json(emptyStats(days, since));
      }
      return res.status(500).json({ error: error.message });
    }

    const stats = aggregatePortalStats((data ?? []) as TelemetryRow[]);
    return res.status(200).json({ days, since, ...stats });
  } catch (e) {
    if (await handleOrgAccessFailure(res, e, req, ROUTE, orgId)) return;
    const message = (e as Error).message;
    if (message.includes('Missing Supabase')) {
      return res.status(503).json({ error: 'Cloud telemetry not configured', code: 'misconfigured' });
    }
    return res.status(500).json({ error: message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'GET') return handleGet(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}
