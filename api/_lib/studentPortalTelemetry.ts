export const TELEMETRY_DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000010';

export const PORTAL_EVENTS = ['student_portal_page_view', 'student_portal_session_pulse'] as const;

export interface TelemetryRow {
  event_name: string;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Single-tenant org for anonymous student portal POSTs (matches roster publish path). */
export function resolveTelemetryOrgId(): string {
  return process.env.VITE_DEFAULT_ORG_ID?.trim() || TELEMETRY_DEFAULT_ORG_ID;
}

export function isStudentPortalPath(path: string): boolean {
  const p = (path || '').trim();
  if (!p || p === '/' || p === '/student-view' || p.startsWith('/student-view/')) return true;
  return p.includes('student-view');
}

export function eventNameForPortalType(type: 'page_view' | 'session_pulse'): string {
  return type === 'page_view' ? 'student_portal_page_view' : 'student_portal_session_pulse';
}

export function aggregatePortalStats(rows: TelemetryRow[]) {
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
    const existing = sessions.get(sessionId) ?? {
      email,
      clicks: 0,
      activeMs: 0,
      views: 0,
      lastAt: row.created_at,
      isFinal: false,
    };

    if (row.event_name === 'student_portal_page_view') existing.views += 1;
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
    sessions.set(sessionId, existing);
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

  return {
    totalClicks,
    totalActiveMs,
    totalViews,
    uniqueStudents,
    sessionCount: sessions.size,
    avgTimePerStudentMs,
    avgTimePerSessionMs,
    studentBreakdown: Array.from(byStudent.values())
      .sort((a, b) => b.activeMs - a.activeMs)
      .map(s => ({
        email: s.email,
        clicks: s.clicks,
        activeMs: s.activeMs,
        sessions: s.sessions,
        views: s.views,
        avgSessionMs: s.sessions ? Math.round(s.activeMs / s.sessions) : 0,
      })),
    telemetryReady: true,
  };
}
