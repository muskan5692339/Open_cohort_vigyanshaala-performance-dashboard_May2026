import type { DiscoveredColumn, SchemaProfile } from '../types/dynamicSchema';
import type { SchemaMigrationChange, SchemaMigrationSummary } from '../types/productionTypes';
import { headerSimilarity, normalizeHeader } from './fuzzyHeaderMatching';
import { migrateLegacyKey, readScoped, resolveOrgId } from './orgScopedStorage';

function detectRenames(
  added: string[],
  removed: string[],
): { renamed: SchemaMigrationChange[]; addedLeft: string[]; removedLeft: string[] } {
  const renamed: SchemaMigrationChange[] = [];
  const usedRemoved = new Set<string>();
  const addedLeft: string[] = [];

  for (const a of added) {
    let best: { r: string; score: number } | null = null;
    for (const r of removed) {
      if (usedRemoved.has(r)) continue;
      const score = headerSimilarity(a, r);
      if (score >= 0.75 && (!best || score > best.score)) best = { r, score };
    }
    if (best) {
      usedRemoved.add(best.r);
      renamed.push({
        kind: 'renamed',
        column: a,
        previousColumn: best.r,
        similarity: Math.round(best.score * 100) / 100,
        message: `"${best.r}" likely renamed to "${a}" (${Math.round(best.score * 100)}% match)`,
      });
    } else {
      addedLeft.push(a);
    }
  }

  const removedLeft = removed.filter(r => !usedRemoved.has(r));
  return { renamed, addedLeft, removedLeft };
}

export function detectSchemaChanges(
  currentHeaders: string[],
  currentColumns: DiscoveredColumn[],
  previousProfile: SchemaProfile | null,
): SchemaMigrationSummary {
  if (!previousProfile) {
    return {
      hasPreviousProfile: false,
      added: currentHeaders,
      removed: [],
      renamed: [],
      typeChanges: [],
      unmapped: currentColumns.filter(c => c.mappedType === 'ignore').map(c => c.name),
      changes: currentHeaders.map(h => ({
        kind: 'added',
        column: h,
        message: `New column "${h}" (no previous profile)`,
      })),
      summaryText: 'No previous mapping profile — all columns treated as new.',
    };
  }

  const current = new Set(currentHeaders);
  const previous = new Set(previousProfile.headers);
  const rawAdded = currentHeaders.filter(h => !previous.has(h));
  const rawRemoved = previousProfile.headers.filter(h => !current.has(h));
  const { renamed, addedLeft, removedLeft } = detectRenames(rawAdded, rawRemoved);

  const typeChanges: SchemaMigrationChange[] = [];
  for (const col of currentColumns) {
    const prevKey =
      previousProfile.mapping[col.name] ? col.name : renamed.find(r => r.column === col.name)?.previousColumn;
    const prevMapping = prevKey ? previousProfile.mapping[prevKey] : undefined;
    if (prevMapping && prevMapping.mappedType !== col.mappedType) {
      typeChanges.push({
        kind: 'type_changed',
        column: col.name,
        previousType: prevMapping.mappedType,
        currentType: col.mappedType,
        message: `"${col.name}" type changed from ${prevMapping.mappedType} to ${col.mappedType}`,
      });
    }
  }

  const unmapped = currentColumns
    .filter(c => !previousProfile.mapping[c.name] && !renamed.some(r => r.column === c.name))
    .map(c => c.name);

  const changes: SchemaMigrationChange[] = [
    ...addedLeft.map(column => ({ kind: 'added' as const, column, message: `Added column "${column}"` })),
    ...removedLeft.map(column => ({ kind: 'removed' as const, column, message: `Removed column "${column}"` })),
    ...renamed,
    ...typeChanges,
    ...unmapped.map(column => ({
      kind: 'unmapped' as const,
      column,
      message: `"${column}" has no saved mapping — review in Schema Review`,
    })),
  ];

  const parts: string[] = [];
  if (addedLeft.length) parts.push(`${addedLeft.length} added`);
  if (removedLeft.length) parts.push(`${removedLeft.length} removed`);
  if (renamed.length) parts.push(`${renamed.length} renamed`);
  if (typeChanges.length) parts.push(`${typeChanges.length} type changes`);
  if (unmapped.length) parts.push(`${unmapped.length} unmapped`);

  return {
    hasPreviousProfile: true,
    added: addedLeft,
    removed: removedLeft,
    renamed,
    typeChanges,
    unmapped,
    changes,
    summaryText: parts.length ? parts.join(' · ') : 'No schema changes detected.',
  };
}

const SCHEMA_BASE_KEY = 'vs_schema_profiles';
const SCHEMA_LEGACY_KEY = 'vs_schema_profiles_v1';

export function latestProfileByHeaders(headers: string[]): SchemaProfile | null {
  try {
    const org = resolveOrgId();
    const profiles =
      readScoped<SchemaProfile[]>(SCHEMA_BASE_KEY, org) ??
      migrateLegacyKey<SchemaProfile>(SCHEMA_LEGACY_KEY, SCHEMA_BASE_KEY, org) ??
      [];
    if (!profiles.length) return null;
    const target = new Set(headers.map(normalizeHeader));
    let best: { p: SchemaProfile; score: number } | null = null;
    for (const p of profiles) {
      const source = new Set((p.headers ?? []).map(normalizeHeader));
      const inter = [...target].filter(x => source.has(x)).length;
      const union = new Set([...target, ...source]).size;
      const score = union ? inter / union : 0;
      if (!best || score > best.score) best = { p, score };
    }
    return best && best.score >= 0.3 ? best.p : profiles[0];
  } catch {
    return null;
  }
}
