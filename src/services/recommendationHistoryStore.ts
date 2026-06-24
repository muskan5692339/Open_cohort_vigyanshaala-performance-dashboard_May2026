import type { InterventionRecommendation, RecommendationHistoryRecord } from '../types/intelligenceTypes';

const STORAGE_KEY = 'vs_recommendation_history_v1';

function readAll(): RecommendationHistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecommendationHistoryRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: RecommendationHistoryRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 500)));
}

export function listRecommendationHistory(limit = 50): RecommendationHistoryRecord[] {
  return readAll()
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, limit);
}

export function appendRecommendationHistory(recommendations: InterventionRecommendation[]): void {
  if (!recommendations.length) return;
  const now = new Date().toISOString();
  const existing = readAll();
  const newRecords: RecommendationHistoryRecord[] = recommendations.map(r => ({
    id: `rec-hist-${r.id}-${now}`,
    recommendation: r,
    generatedAt: now,
  }));
  writeAll([...newRecords, ...existing]);
}

export function acknowledgeRecommendation(historyId: string): void {
  const records = readAll();
  const idx = records.findIndex(r => r.id === historyId);
  if (idx < 0) return;
  records[idx] = { ...records[idx], acknowledged: true };
  writeAll(records);
}
