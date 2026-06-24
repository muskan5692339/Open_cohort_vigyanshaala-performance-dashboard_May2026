import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest } from '@vercel/node';
import {
  OrgAccessError,
  assertOrgAccess,
  extractBearerToken,
  isValidOrganizationId,
} from './assertOrgAccess';

const ORG_A = '00000000-0000-4000-8000-000000000010';
const ORG_B = '00000000-0000-4000-8000-000000000020';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock('./serviceClient', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
  createAnonAuthClient: () => ({
    auth: { getUser: mockGetUser },
  }),
  getSupabaseConfig: () => ({ url: 'http://localhost', anonKey: 'anon', serviceKey: 'service' }),
}));

vi.mock('./securityTelemetry', () => ({
  recordSecurityEvent: vi.fn(),
}));

function reqWithAuth(token = 'valid-token'): VercelRequest {
  return {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  } as VercelRequest;
}

function setupMembership(orgId: string, role: string, found: boolean) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'u@test.com' } }, error: null });
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: found
                  ? { id: 'm1', organization_id: orgId, user_id: USER_ID, role, is_active: true }
                  : null,
                error: null,
              }),
          }),
        }),
      }),
    }),
  });
}

describe('assertOrgAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extractBearerToken parses Authorization header', () => {
    expect(extractBearerToken({ headers: { authorization: 'Bearer abc' } } as VercelRequest)).toBe('abc');
    expect(extractBearerToken({ headers: {} } as VercelRequest)).toBeNull();
  });

  it('isValidOrganizationId accepts UUIDs', () => {
    expect(isValidOrganizationId(ORG_A)).toBe(true);
    expect(isValidOrganizationId('not-a-uuid')).toBe(false);
  });

  it('returns 401 when token missing', async () => {
    await expect(
      assertOrgAccess({ headers: {} } as VercelRequest, ORG_A, { route: '/api/test' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'unauthorized' });
  });

  it('returns 401 when token invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    await expect(assertOrgAccess(reqWithAuth(), ORG_A, { route: '/api/test' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('returns 403 when user is not a member', async () => {
    setupMembership(ORG_A, 'admin', false);
    await expect(assertOrgAccess(reqWithAuth(), ORG_A, { route: '/api/test' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'forbidden',
    });
  });

  it('returns 403 when role insufficient', async () => {
    setupMembership(ORG_A, 'viewer', true);
    await expect(
      assertOrgAccess(reqWithAuth(), ORG_A, { route: '/api/test', requiredRoles: ['admin'] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 200 context for authorized admin member', async () => {
    setupMembership(ORG_A, 'admin', true);
    const ctx = await assertOrgAccess(reqWithAuth(), ORG_A, {
      route: '/api/test',
      requiredRoles: ['admin'],
    });
    expect(ctx.user.id).toBe(USER_ID);
    expect(ctx.membership.organization_id).toBe(ORG_A);
    expect(ctx.serviceDb).toBeDefined();
  });

  it('forbids access to wrong org even with valid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'u@test.com' } }, error: null });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });
    await expect(assertOrgAccess(reqWithAuth(), ORG_B, { route: '/api/test' })).rejects.toBeInstanceOf(
      OrgAccessError,
    );
    await expect(assertOrgAccess(reqWithAuth(), ORG_B, { route: '/api/test' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
