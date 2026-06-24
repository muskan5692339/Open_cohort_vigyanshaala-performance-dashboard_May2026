import type { ColumnMapping, DiscoveredColumn, SchemaProfile } from '../types/dynamicSchema';
import type { FuzzyHeaderMatch } from '../types/productionTypes';
import { listSchemaProfiles, loadSchemaProfile, saveSchemaProfile } from './schemaProfileStore';

export function normalizeHeader(h: string): string {
  return (h ?? '')
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Levenshtein-based similarity 0–1 with normalization for attendance-style variants. */
export function headerSimilarity(a: string, b: string): number {
  const na = normalizeHeader(a);
  const nb = normalizeHeader(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  const inter = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union ? inter / union : 0;

  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  const leven = maxLen ? 1 - dist / maxLen : 0;

  return Math.max(jaccard, leven);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

const FUZZY_THRESHOLD = 0.72;

export function matchHeadersFuzzy(
  currentHeaders: string[],
  profileHeaders: string[],
): FuzzyHeaderMatch[] {
  const matches: FuzzyHeaderMatch[] = [];
  const usedProfile = new Set<string>();

  for (const currentHeader of currentHeaders) {
    let best: FuzzyHeaderMatch | null = null;
    for (const profileHeader of profileHeaders) {
      if (usedProfile.has(profileHeader)) continue;
      const score = headerSimilarity(currentHeader, profileHeader);
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
        best = { currentHeader, profileHeader, score };
      }
    }
    if (best) {
      usedProfile.add(best.profileHeader);
      matches.push(best);
    }
  }
  return matches;
}

export function findBestProfileForHeaders(
  headers: string[],
  profiles: SchemaProfile[],
): { profile: SchemaProfile; score: number; fuzzyMatches: FuzzyHeaderMatch[] } | null {
  let best: { profile: SchemaProfile; score: number; fuzzyMatches: FuzzyHeaderMatch[] } | null = null;

  for (const profile of profiles) {
    const exact = headers.filter(h => profile.mapping[h]).length / Math.max(1, headers.length);
    const fuzzy = matchHeadersFuzzy(headers, profile.headers);
    const fuzzyScore = fuzzy.reduce((s, m) => s + m.score, 0) / Math.max(1, headers.length);
    const score = Math.max(exact, fuzzyScore);
    if (!best || score > best.score) best = { profile, score, fuzzyMatches: fuzzy };
  }

  return best && best.score >= 0.45 ? best : null;
}

/** Apply profile mapping with fuzzy header matching — does not modify inference engine. */
export function applyProfileWithFuzzyMatch(
  columns: DiscoveredColumn[],
  profile: SchemaProfile | null,
  headers: string[],
): { columns: DiscoveredColumn[]; fuzzyMatches: FuzzyHeaderMatch[] } {
  if (!profile) return { columns, fuzzyMatches: [] };

  const fuzzyMatches = matchHeadersFuzzy(headers, profile.headers);
  const mappingByCurrent = new Map<string, ColumnMapping[string]>();

  for (const [col, m] of Object.entries(profile.mapping)) {
    mappingByCurrent.set(col, m);
  }
  for (const fm of fuzzyMatches) {
    const m = profile.mapping[fm.profileHeader];
    if (m) mappingByCurrent.set(fm.currentHeader, m);
  }

  const updated = columns.map(col => {
    const m = mappingByCurrent.get(col.name) ?? profile.mapping[col.name];
    if (!m) return col;
    return {
      ...col,
      mappedType: m.mappedType,
      mappedRole: m.mappedRole,
      mappedDisplayGroup: m.mappedDisplayGroup,
    };
  });

  return { columns: updated, fuzzyMatches };
}

export function listStoredProfiles(): SchemaProfile[] {
  return listSchemaProfiles();
}

export function resolveProfileForUpload(
  fileSignature: string | undefined,
  headers: string[],
): { profile: SchemaProfile | null; fuzzyMatches: FuzzyHeaderMatch[]; source: 'exact' | 'fuzzy' | 'none' } {
  if (fileSignature) {
    const exact = loadSchemaProfile(fileSignature);
    if (exact) return { profile: exact, fuzzyMatches: [], source: 'exact' };
  }

  const profiles = listStoredProfiles();
  const best = findBestProfileForHeaders(headers, profiles);
  if (best) {
    return { profile: best.profile, fuzzyMatches: best.fuzzyMatches, source: 'fuzzy' };
  }

  return { profile: null, fuzzyMatches: [], source: 'none' };
}

export function persistProfile(profile: SchemaProfile): void {
  saveSchemaProfile(profile);
}
