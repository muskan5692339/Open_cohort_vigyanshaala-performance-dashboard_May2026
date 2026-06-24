import type { BusinessRole, ColumnType, DisplayGroup } from '../types/dynamicSchema';

export interface InferenceResult<T> {
  value: T;
  confidence: number;
}

function normalizeHeader(header: string): string {
  return (header ?? '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map(v => (v ?? '').trim()).filter(Boolean))];
}

function nonEmpty(values: string[]): string[] {
  return values.map(v => (v ?? '').trim()).filter(Boolean);
}

function asNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, '').replace('%', '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function ratioLike(value: string): boolean {
  return /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(value.trim());
}

function hasKeyword(header: string, keywords: string[]): boolean {
  return keywords.some(k => header.includes(k));
}

export function inferColumnType(header: string, sampleValues: string[]): InferenceResult<ColumnType> {
  const h = normalizeHeader(header);
  const values = nonEmpty(sampleValues);
  if (!values.length) return { value: 'text', confidence: 0.3 };

  const uniq = uniqueValues(values);
  const numericValues = values.map(asNumber).filter((v): v is number => v !== null);
  const numericRatio = numericValues.length / values.length;
  const hasPercentToken = values.some(v => v.includes('%')) || hasKeyword(h, ['percent', 'percentage', 'pct', '%']);
  const hasEmail = values.some(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));

  if (hasEmail || hasKeyword(h, ['email', 'student id', 'name', 'phone', 'mobile'])) {
    return { value: 'identifier', confidence: hasEmail ? 0.98 : 0.82 };
  }

  if (hasPercentToken || values.some(ratioLike)) {
    return { value: 'percentage', confidence: 0.9 };
  }

  if (numericRatio >= 0.75) {
    return { value: 'numeric', confidence: 0.85 };
  }

  const statusWords = ['submitted', 'pending', 'complete', 'completed', 'incomplete', 'pass', 'fail', 'certified', 'yes', 'no', 'active', 'inactive'];
  const statusMatches = values.filter(v => statusWords.includes(v.toLowerCase())).length;
  if (statusMatches / values.length >= 0.5 || hasKeyword(h, ['status', 'certificate', 'completion'])) {
    return { value: 'status', confidence: 0.8 };
  }

  if (uniq.length <= Math.max(12, Math.ceil(values.length * 0.2))) {
    return { value: 'category', confidence: 0.72 };
  }

  return { value: 'text', confidence: 0.65 };
}

export function inferBusinessRole(header: string, sampleValues: string[]): InferenceResult<BusinessRole> {
  const h = normalizeHeader(header);
  const values = nonEmpty(sampleValues).map(v => v.toLowerCase());

  if (hasKeyword(h, ['attendance', 'attended', 'session'])) return { value: 'attendance', confidence: 0.92 };
  if (hasKeyword(h, ['quiz', 'test', 'exam', 'score', 'final score', 'assessment'])) return { value: 'assessment', confidence: 0.9 };
  if (hasKeyword(h, ['assignment', 'homework', 'swot', 'resume', 'submission'])) return { value: 'assignment', confidence: 0.9 };
  if (hasKeyword(h, ['certificate', 'certification', 'certified'])) return { value: 'certification', confidence: 0.9 };
  if (hasKeyword(h, ['program hours', 'classes attended', 'participation', 'sessions completed'])) return { value: 'participation', confidence: 0.82 };
  if (hasKeyword(h, ['engagement'])) return { value: 'engagement', confidence: 0.95 };
  if (hasKeyword(h, ['college', 'university', 'state', 'gender', 'partner', 'location'])) return { value: 'demographic', confidence: 0.8 };
  if (hasKeyword(h, ['degree', 'subject', 'academic', 'cgpa', 'semester'])) return { value: 'academic', confidence: 0.82 };
  if (hasKeyword(h, ['program', 'cohort', 'batch', 'track'])) return { value: 'program', confidence: 0.8 };

  if (values.some(v => ['submitted', 'pending', 'late submission'].includes(v))) {
    return { value: 'assignment', confidence: 0.7 };
  }

  return { value: 'custom', confidence: 0.45 };
}

export function inferDisplayGroup(
  header: string,
  inferredType: ColumnType,
  inferredRole: BusinessRole,
): InferenceResult<DisplayGroup> {
  const h = normalizeHeader(header);

  if (inferredRole === 'assignment') return { value: 'assignments', confidence: 0.9 };
  if (inferredRole === 'certification') return { value: 'certification', confidence: 0.9 };
  if (inferredRole === 'engagement') return { value: 'engagement', confidence: 0.9 };
  if (inferredRole === 'academic') return { value: 'academic', confidence: 0.85 };
  if (inferredRole === 'program' || inferredRole === 'participation') return { value: 'program', confidence: 0.8 };
  if (inferredRole === 'attendance' || inferredRole === 'assessment') return { value: 'performance', confidence: 0.88 };

  if (inferredType === 'identifier' || inferredType === 'category') return { value: 'profile', confidence: 0.78 };
  if (hasKeyword(h, ['name', 'email', 'phone'])) return { value: 'profile', confidence: 0.85 };

  return { value: 'custom', confidence: 0.5 };
}
