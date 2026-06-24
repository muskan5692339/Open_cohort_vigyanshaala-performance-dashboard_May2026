import type { SchemaProfile } from '../types/dynamicSchema';
import type { SyncContext } from '../types/repositoryTypes';
import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from '../services/orgScopedStorage';
import { hydrateEntity, mergeSchemaProfiles, pushEntityToCloud } from './repositoryCloudSync';

const BASE_KEY = 'vs_schema_profiles';
const LEGACY_KEY = 'vs_schema_profiles_v1';

function readLocal(orgId?: string): SchemaProfile[] {
  const org = orgId ?? resolveOrgId();
  return (
    readScoped<SchemaProfile[]>(BASE_KEY, org) ??
    migrateLegacyKey<SchemaProfile>(LEGACY_KEY, BASE_KEY, org) ??
    []
  );
}

function writeLocal(profiles: SchemaProfile[], orgId?: string): void {
  writeScoped(BASE_KEY, profiles, orgId ?? resolveOrgId());
}

function normalizeHeader(h: string): string {
  return (h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export const schemaProfileRepository = {
  list(ctx?: SyncContext): SchemaProfile[] {
    return readLocal(ctx?.organizationId);
  },

  create(profile: SchemaProfile, ctx?: SyncContext): SchemaProfile {
    const profiles = readLocal(ctx?.organizationId);
    const idx = profiles.findIndex(p => p.fileSignature === profile.fileSignature);
    const now = new Date().toISOString();
    let saved: SchemaProfile;
    if (idx >= 0) {
      saved = {
        ...profiles[idx],
        ...profile,
        createdAt: profiles[idx].createdAt || profile.createdAt || now,
        updatedAt: now,
      };
      profiles[idx] = saved;
    } else {
      saved = { ...profile, createdAt: profile.createdAt || now, updatedAt: profile.updatedAt || now };
      profiles.push(saved);
    }
    writeLocal(profiles, ctx?.organizationId);
    void schemaProfileRepository.sync(ctx);
    return saved;
  },

  getBySignature(fileSignature: string, ctx?: SyncContext): SchemaProfile | null {
    return readLocal(ctx?.organizationId).find(p => p.fileSignature === fileSignature) ?? null;
  },

  findMatching(headers: string[], ctx?: SyncContext): SchemaProfile | null {
    const profiles = readLocal(ctx?.organizationId);
    if (!profiles.length) return null;
    const target = new Set(headers.map(normalizeHeader).filter(Boolean));
    let best: { score: number; profile: SchemaProfile } | null = null;
    for (const p of profiles) {
      const source = new Set((p.headers ?? []).map(normalizeHeader).filter(Boolean));
      const score = jaccard(target, source);
      if (!best || score > best.score) best = { score, profile: p };
    }
    return best && best.score >= 0.55 ? best.profile : null;
  },

  async sync(ctx?: SyncContext): Promise<boolean> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    return pushEntityToCloud('schema_profiles', readLocal(orgId), { ...ctx, organizationId: orgId });
  },

  async hydrate(ctx?: SyncContext): Promise<SchemaProfile[]> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    const local = readLocal(orgId);
    const merged = await hydrateEntity('schema_profiles', local, mergeSchemaProfiles, { ...ctx, organizationId: orgId });
    writeLocal(merged, orgId);
    return merged;
  },
};

export function saveSchemaProfile(profile: SchemaProfile, ctx?: SyncContext): void {
  schemaProfileRepository.create(profile, ctx);
}

export function loadSchemaProfile(fileSignature: string, ctx?: SyncContext): SchemaProfile | null {
  return schemaProfileRepository.getBySignature(fileSignature, ctx);
}

export function findMatchingProfile(headers: string[], ctx?: SyncContext): SchemaProfile | null {
  return schemaProfileRepository.findMatching(headers, ctx);
}

export function listSchemaProfiles(ctx?: SyncContext): SchemaProfile[] {
  return schemaProfileRepository.list(ctx);
}
