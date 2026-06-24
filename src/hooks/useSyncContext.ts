import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { resolveOrgId } from '../services/orgScopedStorage';
import type { SyncContext } from '../types/repositoryTypes';
import { savedViewsRepository } from '../repositories/savedViewsRepository';
import { riskActionsRepository } from '../repositories/riskActionsRepository';
import { auditRepository } from '../repositories/auditRepository';
import { schemaProfileRepository } from '../repositories/schemaProfileRepository';
import { uploadSnapshotsRepository } from '../repositories/uploadSnapshotsRepository';

export function useSyncContext(): SyncContext {
  const { session, user, organization } = useAuth();
  return useMemo(
    () => ({
      organizationId: organization?.id ?? resolveOrgId(),
      userId: user?.id,
      accessToken: session?.access_token,
    }),
    [organization?.id, user?.id, session?.access_token],
  );
}

export async function hydrateAllRepositories(ctx: SyncContext): Promise<void> {
  await Promise.all([
    savedViewsRepository.hydrate(ctx),
    riskActionsRepository.hydrate(ctx),
    auditRepository.hydrate(ctx),
    schemaProfileRepository.hydrate(ctx),
    uploadSnapshotsRepository.hydrate(ctx),
  ]);
}
