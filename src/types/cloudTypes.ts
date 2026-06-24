export type AppRole = 'admin' | 'program_manager' | 'viewer';

export type UploadSource = 'excel' | 'onedrive' | 'demo';

export type SyncRunStatus = 'syncing' | 'success' | 'warning' | 'failed';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: AppRole;
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
}

export interface CloudUploadRecord {
  id: string;
  organizationId: string;
  fileName: string;
  cohortName: string | null;
  source: UploadSource;
  schemaSignature: string | null;
  rowCount: number;
  status: 'active' | 'archived';
  createdBy: string | null;
  createdAt: string;
}

export interface CloudUploadVersion {
  id: string;
  uploadId: string;
  versionNumber: number;
  sheetName: string | null;
  rowCount: number;
  schemaSignature: string | null;
  changedColumns: unknown[];
  syncSource: 'manual' | 'onedrive' | 'api' | 'demo';
  payloadStoragePath: string | null;
  createdAt: string;
}

export interface PersistUploadPayload {
  organizationId: string;
  userId?: string;
  fileName: string;
  cohortName: string;
  source: UploadSource;
  schemaSignature?: string;
  sheetName?: string;
  rowCount: number;
  changedColumns?: unknown[];
  headers?: string[];
  rawRows?: Record<string, string>[];
  mapping?: Record<string, unknown>;
  discoveredColumns?: unknown[];
  existingUploadId?: string;
  syncRunId?: string;
}

export interface CloudSyncQueueItem {
  id: string;
  type: 'upload' | 'audit' | 'schema_profile' | 'snapshot';
  payload: unknown;
  attempts: number;
  createdAt: string;
}

export const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000010';

export const ROLE_PERMISSIONS = {
  upload: ['admin'] as AppRole[],
  mapping: ['admin'] as AppRole[],
  export: ['admin', 'program_manager'] as AppRole[],
  riskAction: ['admin', 'program_manager'] as AppRole[],
  savedViews: ['admin', 'program_manager'] as AppRole[],
  manageUsers: ['admin'] as AppRole[],
  viewDashboard: ['admin', 'program_manager', 'viewer'] as AppRole[],
} as const;

export function roleCan(role: AppRole | null | undefined, permission: keyof typeof ROLE_PERMISSIONS): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[permission].includes(role);
}
