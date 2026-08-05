import type { InterventionRecommendation, RecommendationHistoryRecord } from '../types/intelligenceTypes';

const STORAGE_KEY = 'vs_recommendation_history_v1';
const MAX_RECORDS = 50;

function compactRecord(record: RecommendationHistoryRecord): RecommendationHistoryRecord {
  const rec = record.recommendation;
  return {
    id: record.id,
    generatedAt: record.generatedAt,
    acknowledged: record.acknowledged,
    recommendation: {
      id: rec.id,
      studentKey: rec.studentKey,
      studentLabel: rec.studentLabel.slice(0, 120),
      type: rec.type,
      title: rec.title.slice(0, 200),
      description: rec.description.slice(0, 300),
      priority: rec.priority,
    },
  };
}

function readRaw(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function readAll(): RecommendationHistoryRecord[] {
  try {
    let raw = readRaw(sessionStorage);
    if (!raw) {
      raw = readRaw(localStorage);
      if (raw) {
        try {
          sessionStorage.setItem(STORAGE_KEY, raw);
        } catch {
          // session full — still parse from legacy local copy below
        }
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecommendationHistoryRecord[];
    return Array.isArray(parsed) ? parsed.map(compactRecord).slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

function writeAll(records: RecommendationHistoryRecord[]): boolean {
  const compact = records.slice(0, MAX_RECORDS).map(compactRecord);
  const attempts = [
    compact,
    compact.slice(0, Math.floor(MAX_RECORDS * 0.5)),
    compact.slice(0, 10),
  ];

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — clears legacy quota usage when present
  }

  for (const slice of attempts) {
    const payload = JSON.stringify(slice);
    try {
      sessionStorage.setItem(STORAGE_KEY, payload);
      return true;
    } catch {
      // try smaller slice
    }
  }

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return false;
}

export function listRecommendationHistory(limit = 50): RecommendationHistoryRecord[] {
  return readAll()
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, limit);
}

export function appendRecommendationHistory(_recommendations: InterventionRecommendation[]): void {
  // Disabled — recommendation history filled browser storage and crashed admin.
  // Re-enable only with session-only, capped storage (see writeAll).
}

export function acknowledgeRecommendation(historyId: string): void {
  const records = readAll();
  const idx = records.findIndex(r => r.id === historyId);
  if (idx < 0) return;
  records[idx] = { ...records[idx], acknowledged: true };
  writeAll(records);
}

/** One-time cleanup for browsers that filled localStorage quota. Safe to call on admin boot. */
export function pruneLegacyRecommendationStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
