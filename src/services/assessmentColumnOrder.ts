import { isAssignmentCommentColumn } from './studentAssignmentDisplay';

/** Extract quiz/assignment index from headers like "Quiz 3 Score" or "Assignment2_SWOT". */
export function extractAssessmentNumber(col: string): number | null {
  const m =
    col.match(/quiz\s*(\d+)/i)
    ?? col.match(/assignment\s*(\d+)/i)
    ?? col.match(/assignment(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isFinalScoreHeader(col: string): boolean {
  const l = col.toLowerCase();
  return l.includes('final score') || l.includes('final selection') || l.includes('final assessment');
}

/** Quiz score columns — e.g. "Quiz 1 Score" … "Quiz 7 Score". */
export function isQuizScoreColumn(col: string): boolean {
  if (isFinalScoreHeader(col)) return false;
  const compact = col.toLowerCase().replace(/\s+/g, '');
  return /quiz\d+score/i.test(compact) || /quiz\d+/.test(compact) && col.toLowerCase().includes('score');
}

export function isQuizLikeColumn(col: string): boolean {
  if (isFinalScoreHeader(col)) return false;
  const l = col.toLowerCase();
  return l.includes('quiz') || l.includes('assessment') || l.includes('mcq') || /_quiz_/i.test(col);
}

/** Numbered assignment status columns — excludes *_comments / Comments_* columns. */
export function isNumberedAssignmentColumn(col: string): boolean {
  if (isAssignmentCommentColumn(col)) return false;
  const l = col.toLowerCase().replace(/\s+/g, '');
  return /assignment\d+/i.test(l) || /assignment\s*\d+/i.test(col);
}

export function dedupePreserveOrder(cols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of cols) {
    if (!col || seen.has(col)) continue;
    seen.add(col);
    out.push(col);
  }
  return out;
}

/** Sort quiz/assignment columns by embedded number, then original sheet order. */
export function sortAssessmentColumns(cols: string[], headerOrder: string[] = cols): string[] {
  const orderIndex = new Map(headerOrder.map((h, i) => [h, i]));
  return [...cols].sort((a, b) => {
    const na = extractAssessmentNumber(a);
    const nb = extractAssessmentNumber(b);
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return (orderIndex.get(a) ?? 9999) - (orderIndex.get(b) ?? 9999);
  });
}

export function discoverQuizScoreHeaders(headers: string[]): string[] {
  const scoreCols = headers.filter(isQuizScoreColumn);
  if (scoreCols.length) return sortAssessmentColumns(scoreCols, headers);

  const quizLike = headers.filter(c => isQuizLikeColumn(c) && !isAssignmentCommentColumn(c));
  return sortAssessmentColumns(quizLike, headers);
}

export function discoverNumberedAssignmentHeaders(headers: string[]): string[] {
  const numbered = headers.filter(isNumberedAssignmentColumn);
  return sortAssessmentColumns(numbered, headers);
}

export function mergeAssessmentColumns(
  sources: string[][],
  headerOrder: string[],
): string[] {
  return sortAssessmentColumns(dedupePreserveOrder(sources.flat()), headerOrder);
}

export function formatQuizLabel(col: string): string {
  const n = extractAssessmentNumber(col);
  if (n != null && /quiz/i.test(col)) return `Quiz ${n}`;
  return col.replace(/_/g, ' ').trim() || 'Quiz';
}

export function formatAssignmentLabel(col: string): string {
  const m =
    col.match(/assignment\s*(\d+)[\s_.-]*(.*)/i)
    ?? col.match(/assignment(\d+)[\s_.-]*(.*)/i);
  if (m) {
    const title = m[2].replace(/_/g, ' ').trim();
    return title ? `Assignment ${m[1]}: ${title}` : `Assignment ${m[1]}`;
  }
  return col.replace(/_/g, ' ').trim();
}

const KNOWN_CATEGORY_SCORE_LEAKS = new Set([
  'individual',
  'uk colleges',
  'uk_colleges',
  'usf',
  'ffe',
  'avanti fellows',
  'christ university',
  'sashakth fellow',
]);

/** Quiz 1 column often contains student_category text instead of a numeric score. */
export function isLikelyCategoryNotQuizScore(value: string, studentCategory?: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^-?\d+(\.\d+)?%?$/.test(text.replace(/,/g, ''))) return false;

  if (studentCategory && text.toLowerCase() === studentCategory.toLowerCase()) return true;

  const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (KNOWN_CATEGORY_SCORE_LEAKS.has(norm)) return true;
  if (norm.includes('college') || norm.includes('university') || norm.includes('fellow')) return true;

  return false;
}

export function parseQuizScoreCell(
  raw: string,
  options?: { studentCategory?: string },
): { score: number | null; display: string } {
  const text = raw.trim();
  if (!text) return { score: null, display: '—' };

  if (isLikelyCategoryNotQuizScore(text, options?.studentCategory)) {
    return { score: null, display: 'N/A' };
  }

  const numeric = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!numeric) {
    return { score: null, display: text.length > 14 ? `${text.slice(0, 14)}…` : text };
  }

  const num = parseFloat(text.replace(/,/g, '').replace('%', ''));
  if (!Number.isFinite(num)) return { score: null, display: '—' };
  const score = num > 0 && num <= 1 ? Math.round(num * 100) : Math.min(100, Math.round(num));
  return { score, display: String(score) };
}

export function avgNumericQuizScores(
  cols: string[],
  row: Record<string, string>,
  studentCategory?: string,
): number {
  const scores = cols
    .map(col => parseQuizScoreCell(row[col] ?? '', { studentCategory }).score)
    .filter((s): s is number => s != null);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
