import { getActiveOrganizationId } from './cloud/cloudConfig';
import { DEFAULT_ORG_ID } from '../types/cloudTypes';

export type ReminderScheduleStatus = 'pending' | 'sending_window' | 'sent' | 'not_today';

export interface ReminderStatusPayload {
  ok: boolean;
  logsReady: boolean;
  istNow: string;
  istDay: string;
  nextSend: { label: string; when: string };
  schedule: Array<{
    key: string;
    label: string;
    when: string;
    status?: ReminderScheduleStatus;
    sentCount?: number;
    weekKey?: string;
  }>;
  sundayWeekKey: string;
  midweekWeekKey: string;
  cohortName: string;
  eligibleNow: number;
  activeCandidates: number;
  previewError: string | null;
  sundaySentCount: number;
  midweekSentCount: number;
  lastSentAt: string | null;
  weekSummaries: Array<{ weekKey: string; sent: number; lastSentAt: string }>;
  recentSends: Array<{
    email: string;
    name: string | null;
    weekKey: string;
    reasons: string[];
    attendancePct: number | null;
    assignmentPct: number | null;
    avgQuiz: number | null;
    sentAt: string;
    cohortName: string | null;
  }>;
  note?: string;
  error?: string;
}

function resolveOrgId(organizationId?: string | null): string {
  return organizationId || getActiveOrganizationId() || import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

export async function fetchReminderStatus(
  accessToken: string | undefined,
  organizationId?: string | null,
): Promise<{ data: ReminderStatusPayload | null; error: string | null }> {
  if (!accessToken) {
    return { data: null, error: 'Sign in with cloud admin access to view report status.' };
  }
  try {
    const qs = new URLSearchParams({ orgId: resolveOrgId(organizationId) });
    const res = await fetch(`/api/reminders?slot=status&${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      let message = `Server returned ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // ignore
      }
      return { data: null, error: message };
    }
    return { data: (await res.json()) as ReminderStatusPayload, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message || 'Network error loading report status.' };
  }
}

export function formatIstTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function statusLabel(status?: ReminderScheduleStatus): string {
  switch (status) {
    case 'sent':
      return 'Sent';
    case 'pending':
      return 'Scheduled';
    case 'sending_window':
      return 'Due / in progress';
    default:
      return 'Not today';
  }
}
