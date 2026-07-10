import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createAnonAuthClient, createServiceClient } from './serviceClient.js';
import { recordSecurityEvent } from './securityTelemetry.js';

export type AppRole = 'admin' | 'program_manager' | 'viewer';

export interface OrgMembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
}

export interface AssertOrgAccessResult {
  user: User;
  membership: OrgMembershipRow;
  serviceDb: SupabaseClient;
}

export type OrgAccessErrorCode = 'unauthorized' | 'forbidden' | 'bad_request' | 'misconfigured';

export class OrgAccessError extends Error {
  readonly statusCode: 401 | 403 | 400 | 404 | 503;
  readonly code: OrgAccessErrorCode;
  readonly securityEvent?: 'unauthorized_org_access' | 'forbidden_org_access';

  constructor(
    statusCode: 401 | 403 | 400 | 404 | 503,
    code: OrgAccessErrorCode,
    message: string,
    securityEvent?: 'unauthorized_org_access' | 'forbidden_org_access',
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.securityEvent = securityEvent;
  }
}

export interface AssertOrgAccessOptions {
  route: string;
  requiredRoles?: AppRole[];
  /** When false, missing membership is forbidden. Default true. */
  requireMembership?: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function isValidOrganizationId(orgId: string): boolean {
  return UUID_RE.test(orgId);
}

export async function resolveUserFromToken(token: string): Promise<User | null> {
  const authClient = createAnonAuthClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function loadActiveMembership(
  serviceDb: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<OrgMembershipRow | null> {
  const { data, error } = await serviceDb
    .from('organization_members')
    .select('id, organization_id, user_id, role, is_active')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrgMembershipRow;
}

export async function loadAnyActiveMembershipWithRoles(
  serviceDb: SupabaseClient,
  userId: string,
  roles: AppRole[],
): Promise<OrgMembershipRow | null> {
  const { data, error } = await serviceDb
    .from('organization_members')
    .select('id, organization_id, user_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', roles)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrgMembershipRow;
}

function roleAllowed(memberRole: AppRole, requiredRoles?: AppRole[]): boolean {
  if (!requiredRoles?.length) return true;
  return requiredRoles.includes(memberRole);
}

/**
 * Validates JWT + organization membership before service-role DB access.
 * @throws OrgAccessError
 */
export async function assertOrgAccess(
  req: VercelRequest,
  organizationId: string,
  options: AssertOrgAccessOptions,
): Promise<AssertOrgAccessResult> {
  if (!getSupabaseConfigSafe()) {
    throw new OrgAccessError(503, 'misconfigured', 'Supabase is not configured on the server');
  }

  if (!organizationId || !isValidOrganizationId(organizationId)) {
    throw new OrgAccessError(400, 'bad_request', 'Valid organizationId is required');
  }

  const token = extractBearerToken(req);
  if (!token) {
    throw new OrgAccessError(401, 'unauthorized', 'Missing or invalid Authorization header', 'unauthorized_org_access');
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    throw new OrgAccessError(401, 'unauthorized', 'Invalid or expired session', 'unauthorized_org_access');
  }

  const serviceDb = createServiceClient();
  const membership = await loadActiveMembership(serviceDb, user.id, organizationId);

  if (options.requireMembership !== false && !membership) {
    throw new OrgAccessError(
      403,
      'forbidden',
      'You are not a member of this organization',
      'forbidden_org_access',
    );
  }

  if (membership && !roleAllowed(membership.role, options.requiredRoles)) {
    throw new OrgAccessError(
      403,
      'forbidden',
      'Your role does not have permission for this action',
      'forbidden_org_access',
    );
  }

  if (!membership) {
    throw new OrgAccessError(403, 'forbidden', 'Organization membership required', 'forbidden_org_access');
  }

  return { user, membership, serviceDb };
}

function getSupabaseConfigSafe(): boolean {
  try {
    createServiceClient();
    return true;
  } catch {
    return false;
  }
}

/** OneDrive / Graph routes without org in body — require authenticated admin (upload). */
export async function assertAuthenticatedForSyncOps(
  req: VercelRequest,
  options: AssertOrgAccessOptions & { organizationId?: string },
): Promise<AssertOrgAccessResult> {
  if (options.organizationId) {
    return assertOrgAccess(req, options.organizationId, {
      ...options,
      requiredRoles: options.requiredRoles ?? ['admin'],
    });
  }

  const token = extractBearerToken(req);
  if (!token) {
    throw new OrgAccessError(401, 'unauthorized', 'Missing or invalid Authorization header', 'unauthorized_org_access');
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    throw new OrgAccessError(401, 'unauthorized', 'Invalid or expired session', 'unauthorized_org_access');
  }

  const serviceDb = createServiceClient();
  const membership = await loadAnyActiveMembershipWithRoles(serviceDb, user.id, options.requiredRoles ?? ['admin']);
  if (!membership) {
    throw new OrgAccessError(
      403,
      'forbidden',
      'Admin access required for sync operations',
      'forbidden_org_access',
    );
  }

  return { user, membership, serviceDb };
}

export async function assertUploadBelongsToOrg(
  serviceDb: SupabaseClient,
  uploadId: string,
  organizationId: string,
): Promise<void> {
  const { data, error } = await serviceDb
    .from('uploads')
    .select('organization_id')
    .eq('id', uploadId)
    .maybeSingle();

  if (error || !data) {
    throw new OrgAccessError(404, 'bad_request', 'Upload not found');
  }

  if (data.organization_id !== organizationId) {
    throw new OrgAccessError(403, 'forbidden', 'Upload does not belong to this organization', 'forbidden_org_access');
  }
}

export async function resolveOrganizationIdForUpload(
  serviceDb: SupabaseClient,
  uploadId: string,
): Promise<string> {
  const { data, error } = await serviceDb.from('uploads').select('organization_id').eq('id', uploadId).maybeSingle();
  if (error || !data?.organization_id) {
    throw new OrgAccessError(404, 'bad_request', 'Upload not found');
  }
  return data.organization_id as string;
}

export async function resolveOrganizationIdForVersion(
  serviceDb: SupabaseClient,
  versionId: string,
): Promise<string> {
  const { data, error } = await serviceDb
    .from('upload_versions')
    .select('upload_id, uploads(organization_id)')
    .eq('id', versionId)
    .maybeSingle();

  if (error || !data) {
    throw new OrgAccessError(404, 'bad_request', 'Version not found');
  }

  const uploadMeta = data.uploads as { organization_id?: string } | null;
  const orgId = uploadMeta?.organization_id;
  if (!orgId) {
    throw new OrgAccessError(404, 'bad_request', 'Upload organization not found');
  }
  return orgId;
}

export async function handleOrgAccessFailure(
  res: VercelResponse,
  err: unknown,
  req: VercelRequest,
  route: string,
  organizationId?: string,
): Promise<boolean> {
  if (!(err instanceof OrgAccessError)) return false;

  if (err.securityEvent) {
    try {
      const sb = createServiceClient();
      const token = extractBearerToken(req);
      let userId: string | undefined;
      if (token) {
        const user = await resolveUserFromToken(token);
        userId = user?.id;
      }
      await recordSecurityEvent(sb, err.securityEvent, {
        route,
        organizationId,
        userId,
        reason: err.message,
        method: req.method,
      });
    } catch {
      // ignore telemetry failures
    }
  }

  const body: { error: string; code: OrgAccessErrorCode } = { error: err.message, code: err.code };
  res.status(err.statusCode).json(body);
  return true;
}

export const ORG_READ_ROLES: AppRole[] = ['admin', 'program_manager', 'viewer'];
export const ORG_UPLOAD_ROLES: AppRole[] = ['admin'];
export const ORG_HYBRID_WRITE_ROLES: AppRole[] = ['admin', 'program_manager'];
