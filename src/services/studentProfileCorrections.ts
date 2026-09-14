import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from './orgScopedStorage';
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
const TEST_EMAILS = new Set(['deploy-check@example.com']);

function isRealItem(item: StudentProfileCorrection): boolean {
  return !TEST_EMAILS.has(String(item.email || '').toLowerCase());
}

function readLocal(orgId?: string): StudentProfileCorrection[] {
  const org = orgId ?? resolveOrgId();
  migrateLegacyKey<StudentProfileCorrection>(KEY, KEY, org);
  return readScoped<StudentProfileCorrection[]>(KEY, org) ?? [];
}

/** Scan this browser for any leftover Student Updates history (scoped + legacy keys). */
export function recoverLocalProfileCorrections(): StudentProfileCorrection[] {
  const found: StudentProfileCorrection[] = [];
  const pushAll = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const item = row as StudentProfileCorrection;
      if (!item.email || !item.status) continue;
      if (!isRealItem(item)) continue;
      found.push(item);
    }
  };

  try {
    pushAll(readLocal());
    pushAll(migrateLegacyKey<StudentProfileCorrection>(KEY, KEY));
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key !== KEY && !key.startsWith(`${KEY}_`)) continue;
      try {
        pushAll(JSON.parse(localStorage.getItem(key) || '[]'));
      } catch {
        // ignore bad json
      }
    }
  } catch {
    // ignore
  }

  const byId = new Map<string, StudentProfileCorrection>();
  for (const item of found) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
      continue;
    }
    const rank = (s: ProfileCorrectionStatus) => (s === 'approved' || s === 'rejected' ? 2 : 1);
    if (rank(item.status) > rank(prev.status)) {
      byId.set(item.id, item);
      continue;
    }
    const prevTime = prev.reviewedAt || prev.submittedAt;
    const nextTime = item.reviewedAt || item.submittedAt;
    if (nextTime >= prevTime) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function writeLocal(items: StudentProfileCorrection[], orgId?: string): void {
  writeScoped(KEY, items.filter(isRealItem), orgId ?? resolveOrgId());
}

function mergeLocalAndCloud(
  cloud: StudentProfileCorrection[],
  local: StudentProfileCorrection[],
): StudentProfileCorrection[] {
  const byId = new Map<string, StudentProfileCorrection>();
  const rank = (s: ProfileCorrectionStatus) => (s === 'approved' || s === 'rejected' ? 2 : 1);
  const prefer = (a: StudentProfileCorrection, b: StudentProfileCorrection) => {
    if (rank(b.status) !== rank(a.status)) return rank(b.status) > rank(a.status) ? b : a;
    const aTime = a.reviewedAt || a.submittedAt;
    const bTime = b.reviewedAt || b.submittedAt;
    return bTime >= aTime ? b : a;
  };
  for (const item of [...cloud, ...local].filter(isRealItem)) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? prefer(prev, item) : item);
  }
  return [...byId.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function resolveOrg(): string {
  return getActiveOrganizationId() || import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

function studentOrgId(): string {
  return import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

/** Sync local helpers kept for student pending banner offline cache. */
export function listProfileCorrections(status?: ProfileCorrectionStatus): StudentProfileCorrection[] {
  const all = recoverLocalProfileCorrections().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
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
  const org = studentOrgId();
  const existing = readLocal(org).filter(
    c => !(c.email === item.email && c.status === 'pending') && c.id !== item.id,
  );
  writeLocal([item, ...existing], org);
}

export interface StudentProfileCorrectionStatus {
  pending: StudentProfileCorrection | null;
  approved: StudentProfileCorrection | null;
}

function readLocalApprovedForEmail(email: string): StudentProfileCorrection | null {
  const key = email.toLowerCase().trim();
  return (
    recoverLocalProfileCorrections()
      .filter(c => c.email.toLowerCase() === key && c.status === 'approved')
      .sort((a, b) =>
        (b.reviewedAt || b.submittedAt).localeCompare(a.reviewedAt || a.submittedAt),
      )[0] ?? null
  );
}

/** Student portal: pending + latest approved correction from cloud. */
export async function fetchStudentProfileCorrectionStatus(
  email: string,
): Promise<StudentProfileCorrectionStatus> {
  const key = email.toLowerCase().trim();
  const localPending = getPendingCorrectionForEmail(email);
  const localApproved = readLocalApprovedForEmail(email);
  if (!key) {
    return { pending: localPending, approved: localApproved };
  }
  try {
    const qs = new URLSearchParams({
      resource: 'profile-corrections',
      email: key,
    });
    const res = await fetch(`/api/student-engagement?${qs}`);
    const body = (await res.json().catch(() => ({}))) as {
      pending?: boolean;
      item?: StudentProfileCorrection | null;
      approved?: StudentProfileCorrection | null;
    };
    if (res.ok) {
      const org = studentOrgId();
      const rest = readLocal(org).filter(
        c => !(c.email.toLowerCase() === key && c.status === 'pending'),
      );
      if (body.pending && body.item) {
        cacheLocalCorrection(body.item);
        return {
          pending: body.item,
          approved: body.approved ?? localApproved,
        };
      }
      if (body.approved) {
        writeLocal([body.approved, ...rest.filter(c => c.id !== body.approved!.id)], org);
      } else {
        writeLocal(rest, org);
      }
      return {
        pending: null,
        approved: body.approved ?? localApproved,
      };
    }
  } catch {
    // fall through to local
  }
  return { pending: localPending, approved: localApproved };
}

/** Student portal: re-check cloud so pending survives refresh / other devices. */
export async function fetchPendingProfileCorrectionCloud(
  email: string,
): Promise<StudentProfileCorrection | null> {
  const status = await fetchStudentProfileCorrectionStatus(email);
  return status.pending;
}

export interface StudentProfileDisplayFields {
  phone: string;
  college: string;
  course: string;
  year: string;
}

/** Overlay admin-approved profile fields onto Excel-sourced values. */
export function applyApprovedProfileOverrides(
  profile: StudentProfileDisplayFields,
  approved: StudentProfileCorrection | null,
): StudentProfileDisplayFields {
  if (!approved?.fields) return profile;
  const fields = approved.fields;
  return {
    phone: fields.phone?.trim() || profile.phone,
    college: fields.college?.trim() || profile.college,
    course: fields.course?.trim() || profile.course,
    year: fields.year?.trim() || profile.year,
  };
}

export function hasApprovedProfileOverrides(
  base: StudentProfileDisplayFields,
  approved: StudentProfileCorrection | null,
): boolean {
  if (!approved?.fields) return false;
  const next = applyApprovedProfileOverrides(base, approved);
  return (
    next.phone !== base.phone ||
    next.college !== base.college ||
    next.course !== base.course ||
    next.year !== base.year
  );
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
  /** How many local browser rows were missing from cloud and re-uploaded. */
  recoveredFromBrowser?: number;
}

function emptyListResult(error: string | null, tableReady = false): ProfileCorrectionsListResult {
  const local = recoverLocalProfileCorrections();
  return {
    items: local,
    pendingCount: local.filter(i => i.status === 'pending').length,
    approvedCount: local.filter(i => i.status === 'approved').length,
    rejectedCount: local.filter(i => i.status === 'rejected').length,
    tableReady,
    error,
    recoveredFromBrowser: 0,
  };
}

/** Explicitly push every local/browser row into cloud (admin restore). */
export async function restoreProfileCorrectionsFromBrowser(
  accessToken: string | undefined,
  organizationId?: string | null,
): Promise<ProfileCorrectionsListResult> {
  if (!accessToken) {
    return emptyListResult('Sign in with cloud admin access to restore history.');
  }
  const orgId = organizationId || resolveOrg();
  const localItems = recoverLocalProfileCorrections();
  if (localItems.length === 0) {
    return emptyListResult(
      'No Student Updates history found in this browser. Open Student Updates on the same computer/browser where you approved earlier, or ask students to submit again.',
      true,
    );
  }
  try {
    const res = await fetch('/api/student-engagement?resource=profile-corrections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        resource: 'profile-corrections',
        action: 'merge',
        orgId,
        items: localItems,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      items?: StudentProfileCorrection[];
      error?: string;
      imported?: number;
    };
    if (!res.ok) {
      return emptyListResult(body.error ?? `Restore failed (${res.status})`);
    }
    const cloudItems = (body.items ?? []).filter(isRealItem);
    const items = mergeLocalAndCloud(cloudItems, localItems);
    writeLocal(items, orgId);
    return {
      items,
      pendingCount: items.filter(i => i.status === 'pending').length,
      approvedCount: items.filter(i => i.status === 'approved').length,
      rejectedCount: items.filter(i => i.status === 'rejected').length,
      tableReady: true,
      error: null,
      recoveredFromBrowser: body.imported ?? localItems.length,
    };
  } catch (e) {
    return emptyListResult((e as Error).message || 'Network error during restore.');
  }
}

export async function submitProfileCorrectionCloud(input: {
  email: string;
  studentName: string;
  fields: StudentProfileCorrection['fields'];
}): Promise<{ item: StudentProfileCorrection | null; error: string | null }> {
  try {
    const res = await fetch('/api/student-engagement?resource=profile-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource: 'profile-corrections',
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
    return emptyListResult('Sign in with cloud admin access to view student updates.');
  }
  const orgId = organizationId || resolveOrg();
  try {
    const qs = new URLSearchParams({
      orgId,
      status,
      resource: 'profile-corrections',
    });
    const res = await fetch(`/api/student-engagement?${qs}`, {
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
      const fallback = emptyListResult(body.error ?? `Server returned ${res.status}`);
      return fallback.items.length
        ? { ...fallback, error: `${fallback.error} Showing history saved on this browser.` }
        : fallback;
    }
    const cloudItems = (body.items ?? []).filter(isRealItem);
    const localItems = recoverLocalProfileCorrections();
    const items = mergeLocalAndCloud(cloudItems, localItems);
    // Keep merged history in this browser; do not wipe approved/rejected rows.
    writeLocal(items, orgId);

    // If this browser still has history missing from cloud, push it up once.
    const cloudIds = new Set(cloudItems.map(i => i.id));
    const missingInCloud = localItems.filter(i => !cloudIds.has(i.id));
    if (missingInCloud.length > 0) {
      try {
        await fetch('/api/student-engagement?resource=profile-corrections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            resource: 'profile-corrections',
            action: 'merge',
            orgId,
            items: missingInCloud,
          }),
        });
      } catch {
        // ignore merge upload failures; UI still shows local+cloud merge
      }
    }

    return {
      items,
      pendingCount: items.filter(i => i.status === 'pending').length,
      approvedCount: items.filter(i => i.status === 'approved').length,
      rejectedCount: items.filter(i => i.status === 'rejected').length,
      tableReady: body.tableReady !== false,
      error: body.error ?? null,
      recoveredFromBrowser: missingInCloud.length,
    };
  } catch (e) {
    const fallback = emptyListResult((e as Error).message || 'Network error loading student updates.');
    return fallback.items.length
      ? { ...fallback, error: `${fallback.error} Showing history saved on this browser.` }
      : fallback;
  }
}

export async function reviewProfileCorrectionCloud(
  accessToken: string | undefined,
  id: string,
  status: 'approved' | 'rejected',
  adminNote?: string,
  organizationId?: string | null,
): Promise<{ item: StudentProfileCorrection | null; error: string | null }> {
  if (!accessToken) {
    return {
      item: null,
      error: 'Sign in required to approve. Click Sign in (top right), then try Approve again.',
    };
  }
  const orgId = organizationId || resolveOrg();
  try {
    // Use POST action=review (more reliable than PATCH on some hosts).
    const res = await fetch(`/api/student-engagement?resource=profile-corrections&orgId=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        resource: 'profile-corrections',
        action: 'review',
        orgId,
        id,
        status,
        adminNote,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      item?: StudentProfileCorrection;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      if (res.status === 401 || body.code === 'unauthorized') {
        return { item: null, error: 'Session expired. Sign in again, then Approve.' };
      }
      if (res.status === 403 || body.code === 'forbidden') {
        return {
          item: null,
          error: body.error ?? 'Your account cannot approve. Use an admin or program manager login.',
        };
      }
      return { item: null, error: body.error ?? `Server returned ${res.status}` };
    }
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
