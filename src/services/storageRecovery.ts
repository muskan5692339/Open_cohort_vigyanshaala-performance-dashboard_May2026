import { pruneLegacyRecommendationStorage } from './recommendationHistoryStore';

/** Keys that previously filled localStorage and crashed the admin page. */
const LEGACY_HEAVY_KEYS = [
  'vs_recommendation_history_v1',
];

/** Run before React mounts — frees quota from legacy recommendation history blobs. */
export function recoverBrowserStorage(): void {
  pruneLegacyRecommendationStorage();
  for (const key of LEGACY_HEAVY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/** Clear dashboard caches so admin can open after quota errors (roster must be re-uploaded). */
export function clearDashboardStorage(): void {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('vs_')) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export function isStorageQuotaError(message: string): boolean {
  return /quota|setitem|storage|exceeded/i.test(message);
}
