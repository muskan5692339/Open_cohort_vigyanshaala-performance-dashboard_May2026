import { readScoped, resolveOrgId, writeScoped } from './orgScopedStorage';
import { getActiveOrganizationId } from './cloud/cloudConfig';
import { DEFAULT_ORG_ID } from '../types/cloudTypes';

export type ProfileCorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface StudentProfileCorrection {
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

const KEY = 'vs_student_profile_corrections';

function readLocal(orgId?: string): StudentProfileCorrection[] {
  return readScoped<StudentProfileCorrection[]>(KEY, orgId ?? resolveOrgId()) ?? [];
}

function writeLocal(items: StudentProfileCorrection[], orgId?: string): void {
  writeScoped(KEY, items, orgId ?? resolveOrgId());
}

function resolveOrg(): string {
  return getActiveOrganizationId() || import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

function studentOrgId(): string {
  return import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

/** Sync local helpers kept for student pending banner offline cache. */
export function listProfileCorrections(status?: ProfileCorrectionStatus): StudentProfileCorrection[] {
  const all = readLocal().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return status ? all.filter(c => c.status === status) : all;
}

export function getPendingCorrectionForEmail(email: string): StudentProfileCorrection | null {
  const key = email.toLowerCase().trim();
  return listProfileCorrections('pending').find(c => c.email.toLowerCase() === key) ?? null;
}

export function countPendingProfileCorrections(): number {
  return listProfileCorrections('pending').length;
}

export function cacheLocalCorrection(item: StudentProfileCorrection): void {
  const existing = readLocal().filter(
    c => !(c.email === item.email && c.status === 'pending') && c.id !== item.id,
  );
  writeLocal([item, ...existing]);
}

export function submitProfileCorrection(input: {
  email: string;
  studentName: string;
  fields: StudentProfileCorrection['fields'];
}): StudentProfileCorrection {
  const email = input.email.toLowerCase().trim();
  const existing = readLocal();
  const withoutPending = existing.filter(
    c => !(c.email === email && c.status === 'pending'),
  );
  const item: StudentProfileCorrection = {
    id: `corr-${Date.now()}`,
    email,
    studentName: input.studentName,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    fields: input.fields,
  };
  writeLocal([item, ...withoutPending]);
  return item;
}

export function reviewProfileCorrection(
  id: string,
  status: 'approved' | 'rejected',
  adminNote?: string,
): StudentProfileCorrection | null {
  const all = readLocal();
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status,
    adminNote,
    reviewedAt: new Date().toISOString(),
  };
  writeLocal(all);
  return all[idx];
}

export interface ProfileCorrectionsListResult {
  items: StudentProfileCorrection[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  tableReady: boolean;
  error: string | null;
}

export async function submitProfileCorrectionCloud(input: {
  email: string;
  studentName: string;
  fields: StudentProfileCorrection['fields'];
}): Promise<{ item: StudentProfileCorrection | null; error: string | null }> {
  try {
    const res = await fetch('/api/profile-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        studentName: input.studentName,
        fields: input.fields,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      item?: StudentProfileCorrection;
      error?: string;
    };
    if (!res.ok) {
      // Offline / misconfigured fallback — still keep local copy so student sees pending.
      const local = submitProfileCorrection(input);
      return {
        item: local,
        error: body.error
          ?? `Could not reach cloud (${res.status}). Saved on this device only — admin may not see it until cloud is fixed.`,
      };
    }
    if (body.item) cacheLocalCorrection(body.item);
    return { item: body.item ?? null, error: null };
  } catch (e) {
    const local = submitProfileCorrection(input);
    return {
      item: local,
      error: `${(e as Error).message || 'Network error'}. Saved on this device only.`,
    };
  }
}

export async function fetchProfileCorrectionsCloud(
  accessToken: string | undefined,
  organizationId?: string | null,
  status: ProfileCorrectionStatus | 'all' = 'all',
): Promise<ProfileCorrectionsListResult> {
  if (!accessToken) {
    return {
      items: [],
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      tableReady: false,
      error: 'Sign in with cloud admin access to view student updates.',
    };
  }
  const orgId = organizationId || resolveOrg();
  try {
    const qs = new URLSearchParams({ orgId, status });
    const res = await fetch(`/api/profile-corrections?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      items?: StudentProfileCorrection[];
      pendingCount?: number;
      approvedCount?: number;
      rejectedCount?: number;
      tableReady?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        items: [],
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        tableReady: false,
        error: body.error ?? `Server returned ${res.status}`,
      };
    }
    const items = body.items ?? [];
    // Mirror to local so sidebar badge works after load.
    writeLocal(items, orgId);
    return {
      items,
      pendingCount: body.pendingCount ?? items.filter(i => i.status === 'pending').length,
      approvedCount: body.approvedCount ?? items.filter(i => i.status === 'approved').length,
      rejectedCount: body.rejectedCount ?? items.filter(i => i.status === 'rejected').length,
      tableReady: body.tableReady !== false,
      error: body.error ?? null,
    };
  } catch (e) {
    return {
      items: [],
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      tableReady: false,
      error: (e as Error).message || 'Network error loading student updates.',
    };
  }
}

export async function reviewProfileCorrectionCloud(
  accessToken: string | undefined,
  id: string,
  status: 'approved' | 'rejected',
  adminNote?: string,
  organizationId?: string | null,
): Promise<{ item: StudentProfileCorrection | null; error: string | null }> {
  if (!accessToken) return { item: null, error: 'Sign in required' };
  const orgId = organizationId || resolveOrg();
  try {
    const res = await fetch('/api/profile-corrections', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orgId, id, status, adminNote }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      item?: StudentProfileCorrection;
      error?: string;
    };
    if (!res.ok) return { item: null, error: body.error ?? `Server returned ${res.status}` };
    if (body.item) {
      const all = readLocal(orgId).filter(c => c.id !== body.item!.id);
      writeLocal([body.item, ...all], orgId);
    }
    return { item: body.item ?? null, error: null };
  } catch (e) {
    return { item: null, error: (e as Error).message || 'Network error' };
  }
}

export { studentOrgId };
