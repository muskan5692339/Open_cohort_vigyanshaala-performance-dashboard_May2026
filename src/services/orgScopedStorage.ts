import { DEFAULT_ORG_ID } from '../types/cloudTypes';
import { getActiveOrganizationId } from './cloud/cloudConfig';

let orgIdResolver: (() => string) | null = null;

/** Register org resolver from AuthContext (session membership). */
export function setOrgIdResolver(resolver: () => string): void {
  orgIdResolver = resolver;
}

/** Resolve org ID — prefer authenticated membership over client override. */
export function resolveOrgId(): string {
  try {
    return orgIdResolver?.() ?? getActiveOrganizationId() ?? DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

export function getScopedKey(baseKey: string, orgId?: string): string {
  const org = orgId ?? resolveOrgId();
  return `${baseKey}_${org}`;
}

export function readScoped<T>(baseKey: string, orgId?: string): T | null {
  try {
    const raw = localStorage.getItem(getScopedKey(baseKey, orgId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeScoped<T>(baseKey: string, value: T, orgId?: string): boolean {
  try {
    localStorage.setItem(getScopedKey(baseKey, orgId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearOrgScope(baseKey: string, orgId?: string): void {
  try {
    localStorage.removeItem(getScopedKey(baseKey, orgId));
  } catch {
    // ignore
  }
}

/** Migrate legacy unscoped key into org-scoped bucket once. */
export function migrateLegacyKey<T>(legacyKey: string, baseKey: string, orgId?: string): T[] | null {
  const org = orgId ?? resolveOrgId();
  const scoped = readScoped<T[]>(baseKey, org);
  if (scoped && scoped.length) return scoped;

  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    if (Array.isArray(parsed) && parsed.length) {
      if (writeScoped(baseKey, parsed, org)) {
        try {
          localStorage.removeItem(legacyKey);
        } catch {
          // ignore
        }
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}
