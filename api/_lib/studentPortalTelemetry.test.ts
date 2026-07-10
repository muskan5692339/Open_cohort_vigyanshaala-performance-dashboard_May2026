import { describe, expect, it } from 'vitest';
import {
  aggregatePortalStats,
  isStudentPortalPath,
  resolveTelemetryOrgId,
  TELEMETRY_DEFAULT_ORG_ID,
} from './studentPortalTelemetry';

describe('resolveTelemetryOrgId', () => {
  it('uses VITE_DEFAULT_ORG_ID when set', () => {
    const prev = process.env.VITE_DEFAULT_ORG_ID;
    process.env.VITE_DEFAULT_ORG_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    expect(resolveTelemetryOrgId()).toBe('aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee');
    process.env.VITE_DEFAULT_ORG_ID = prev;
  });

  it('falls back to seed org id', () => {
    const prev = process.env.VITE_DEFAULT_ORG_ID;
    delete process.env.VITE_DEFAULT_ORG_ID;
    expect(resolveTelemetryOrgId()).toBe(TELEMETRY_DEFAULT_ORG_ID);
    process.env.VITE_DEFAULT_ORG_ID = prev;
  });
});

describe('isStudentPortalPath', () => {
  it('accepts student-view and root paths', () => {
    expect(isStudentPortalPath('/student-view')).toBe(true);
    expect(isStudentPortalPath('/student-view/')).toBe(true);
    expect(isStudentPortalPath('/')).toBe(true);
  });

  it('rejects admin paths', () => {
    expect(isStudentPortalPath('/admin')).toBe(false);
    expect(isStudentPortalPath('/admin/portal-analytics')).toBe(false);
  });
});

describe('aggregatePortalStats', () => {
  it('aggregates views, clicks, and active time per session', () => {
    const stats = aggregatePortalStats([
      {
        event_name: 'student_portal_page_view',
        duration_ms: null,
        metadata: { sessionId: 's1', studentEmail: 'a@test.com' },
        created_at: '2026-07-01T10:00:00.000Z',
      },
      {
        event_name: 'student_portal_session_pulse',
        duration_ms: 120_000,
        metadata: { sessionId: 's1', studentEmail: 'a@test.com', clickCount: 3, isFinal: true },
        created_at: '2026-07-01T10:05:00.000Z',
      },
    ]);

    expect(stats.totalViews).toBe(1);
    expect(stats.totalClicks).toBe(3);
    expect(stats.totalActiveMs).toBe(120_000);
    expect(stats.uniqueStudents).toBe(1);
    expect(stats.studentBreakdown[0]?.email).toBe('a@test.com');
  });
});
