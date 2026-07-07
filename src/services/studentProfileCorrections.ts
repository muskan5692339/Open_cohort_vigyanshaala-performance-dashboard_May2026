import { readScoped, resolveOrgId, writeScoped } from './orgScopedStorage';

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

function readAll(orgId?: string): StudentProfileCorrection[] {
  return readScoped<StudentProfileCorrection[]>(KEY, orgId ?? resolveOrgId()) ?? [];
}

function writeAll(items: StudentProfileCorrection[], orgId?: string): void {
  writeScoped(KEY, items, orgId ?? resolveOrgId());
}

export function listProfileCorrections(status?: ProfileCorrectionStatus): StudentProfileCorrection[] {
  const all = readAll().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return status ? all.filter(c => c.status === status) : all;
}

export function getPendingCorrectionForEmail(email: string): StudentProfileCorrection | null {
  const key = email.toLowerCase().trim();
  return listProfileCorrections('pending').find(c => c.email.toLowerCase() === key) ?? null;
}

export function submitProfileCorrection(input: {
  email: string;
  studentName: string;
  fields: StudentProfileCorrection['fields'];
}): StudentProfileCorrection {
  const email = input.email.toLowerCase().trim();
  const existing = readAll();
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
  writeAll([item, ...withoutPending]);
  return item;
}

export function reviewProfileCorrection(
  id: string,
  status: 'approved' | 'rejected',
  adminNote?: string,
): StudentProfileCorrection | null {
  const all = readAll();
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status,
    adminNote,
    reviewedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[idx];
}

export function countPendingProfileCorrections(): number {
  return listProfileCorrections('pending').length;
}
