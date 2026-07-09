import { getActiveOrganizationId } from './cloud/cloudConfig';
import { DEFAULT_ORG_ID } from '../types/cloudTypes';

export interface StudentPortalStats {
  days: number;
  since: string;
  totalClicks: number;
  totalActiveMs: number;
  totalViews: number;
  uniqueStudents: number;
  sessionCount: number;
  avgTimePerStudentMs: number;
  avgTimePerSessionMs: number;
  studentBreakdown: {
    email: string;
    clicks: number;
    activeMs: number;
    sessions: number;
    views: number;
    avgSessionMs: number;
  }[];
}

function resolveOrgId(): string {
  return getActiveOrganizationId() || import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

export function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export async function fetchStudentPortalStats(
  accessToken: string | undefined,
  days = 30,
): Promise<{ stats: StudentPortalStats | null; error: string | null }> {
  if (!accessToken) {
    return { stats: null, error: 'Sign in with cloud admin access to view student portal analytics.' };
  }
  const orgId = resolveOrgId();
  try {
    const qs = new URLSearchParams({
      mode: 'portal-analytics',
      orgId,
      days: String(days),
    });
    const res = await fetch(`/api/list-uploads?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      let message = `Server returned ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // ignore
      }
      return { stats: null, error: message };
    }
    return { stats: (await res.json()) as StudentPortalStats, error: null };
  } catch (e) {
    return { stats: null, error: (e as Error).message || 'Network error loading portal analytics.' };
  }
}
