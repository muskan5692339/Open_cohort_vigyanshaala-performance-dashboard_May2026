import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertOrgAccess, handleOrgAccessFailure, ORG_READ_ROLES } from './_lib/assertOrgAccess';
import { createServiceClient } from './_lib/serviceClient';

const ROUTE = '/api/student-engagement';

const PORTAL_EVENTS = ['student_portal_page_view', 'student_portal_session_pulse'] as const;

interface PostBody {
  orgId: string;
  type: 'page_view' | 'session_pulse';
  sessionId: string;
  path: string;
  studentEmail?: string;
  clickCount?: number;
  activeMs?: number;
  isFinal?: boolean;
}

interface TelemetryRow {
  event_name: string;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function eventNameForType(type: PostBody['type']): string {
  return type === 'page_view' ? 'student_portal_page_view' : 'student_portal_session_pulse';
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  let raw = req.body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as PostBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  const body = raw as PostBody;
  if (!body?.orgId || !body?.sessionId || !body?.type || !body?.path) {
    return res.status(400).json({ error: 'orgId, sessionId, type, and path required' });
  }
  if (!body.path.includes('student-view') && body.path !== '/student-view') {
    return res.status(400).json({ error: 'Only student-view path is tracked' });
  }

  try {
    const serviceDb = createServiceClient();
    const email = typeof body.studentEmail === 'string' ? body.studentEmail.trim().toLowerCase().slice(0, 200) : null;
    const { error } = await serviceDb.from('telemetry_events').insert({
      organization_id: body.orgId,
      event_name: eventNameForType(body.type),
      duration_ms: body.type === 'session_pulse' ? Math.max(0, Math.round(body.activeMs ?? 0)) : null,
      metadata: {
        sessionId: body.sessionId.slice(0, 80),
        path: body.path.slice(0, 120),
        studentEmail: email,
        clickCount: Math.max(0, Math.round(body.clickCount ?? 0)),
        isFinal: Boolean(body.isFinal),
      },
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('Missing Supabase')) {
      return res.status(503).json({ error: 'Cloud telemetry not configured', code: 'misconfigured' });
    }
    return res.status(500).json({ error: message });
  }
}

function aggregatePortalStats(rows: TelemetryRow[]) {
  const sessions = new Map<string, {
    email: string;
    clicks: number;
    activeMs: number;
    views: number;
    lastAt: string;
    isFinal: boolean;
  }>();

  for (const row of rows) {
    const meta = row.metadata ?? {};
    const sessionId = String(meta.sessionId ?? '');
    if (!sessionId) continue;
    const email = String(meta.studentEmail ?? 'anonymous').toLowerCase();
    const key = sessionId;
    const existing = sessions.get(key) ?? {
      email,
      clicks: 0,
      activeMs: 0,
      views: 0,
      lastAt: row.created_at,
      isFinal: false,
    };

    if (row.event_name === 'student_portal_page_view') {
      existing.views += 1;
    }
    if (row.event_name === 'student_portal_session_pulse') {
      const clicks = Number(meta.clickCount ?? 0);
      const ms = row.duration_ms ?? 0;
      const isFinal = Boolean(meta.isFinal);
      if (isFinal || row.created_at >= existing.lastAt) {
        existing.clicks = Math.max(existing.clicks, clicks);
        existing.activeMs = Math.max(existing.activeMs, ms);
        existing.isFinal = existing.isFinal || isFinal;
        existing.lastAt = row.created_at;
      }
    }
    existing.email = email;
    sessions.set(key, existing);
  }

  const byStudent = new Map<string, { email: string; clicks: number; activeMs: number; sessions: number; views: number }>();
  let totalClicks = 0;
  let totalActiveMs = 0;
  let totalViews = 0;

  for (const s of sessions.values()) {
    totalClicks += s.clicks;
    totalActiveMs += s.activeMs;
    totalViews += Math.max(1, s.views);
    const cur = byStudent.get(s.email) ?? { email: s.email, clicks: 0, activeMs: 0, sessions: 0, views: 0 };
    cur.clicks += s.clicks;
    cur.activeMs += s.activeMs;
    cur.sessions += 1;
    cur.views += Math.max(1, s.views);
    byStudent.set(s.email, cur);
  }

  const uniqueStudents = byStudent.size;
  const avgTimePerStudentMs = uniqueStudents ? Math.round(totalActiveMs / uniqueStudents) : 0;
  const avgTimePerSessionMs = sessions.size ? Math.round(totalActiveMs / sessions.size) : 0;

  const studentBreakdown = Array.from(byStudent.values())
    .sort((a, b) => b.activeMs - a.activeMs)
    .map(s => ({
      email: s.email,
      clicks: s.clicks,
      activeMs: s.activeMs,
      sessions: s.sessions,
      views: s.views,
      avgSessionMs: s.sessions ? Math.round(s.activeMs / s.sessions) : 0,
    }));

  return {
    totalClicks,
    totalActiveMs,
    totalViews,
    uniqueStudents,
    sessionCount: sessions.size,
    avgTimePerStudentMs,
    avgTimePerSessionMs,
    studentBreakdown,
  };
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const orgId = String(req.query.orgId ?? '');
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { serviceDb } = await assertOrgAccess(req, orgId, {
      route: ROUTE,
      requiredRoles: ORG_READ_ROLES,
    });

    const { data, error } = await serviceDb
      .from('telemetry_events')
      .select('event_name, duration_ms, metadata, created_at')
      .eq('organization_id', orgId)
      .in('event_name', [...PORTAL_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) return res.status(500).json({ error: error.message });

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
