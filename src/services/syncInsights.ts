import type { FuzzyHeaderMatch, SchemaMigrationSummary } from '../types/productionTypes';
import type { CloudWorkbookSyncResult, SyncHealthScore } from '../types/syncOrchestrationTypes';

export function generateSyncInsights(input: {
  schemaMigration: SchemaMigrationSummary;
  fuzzyMatches: FuzzyHeaderMatch[];
  warnings: string[];
  errors: string[];
  sheetName: string;
  status: CloudWorkbookSyncResult['status'];
  requiresMappingReview: boolean;
}): string[] {
  const insights: string[] = [];

  if (input.status === 'failed') {
    insights.push(input.errors[0] ?? 'Sync failed — previous dashboard preserved.');
    return insights;
  }

  if (input.schemaMigration.renamed.length) {
    const r = input.schemaMigration.renamed[0];
    insights.push(`Column likely renamed: "${r.previousColumn}" → "${r.column}".`);
  }

  if (input.schemaMigration.added.length) {
    insights.push(`${input.schemaMigration.added.length} new column(s) detected.`);
  }

  if (
    input.schemaMigration.added.length === 0 &&
    input.schemaMigration.removed.length === 0 &&
    input.schemaMigration.renamed.length === 0
  ) {
    insights.push('No schema changes from previous upload.');
  }

  if (input.fuzzyMatches.length) {
    insights.push(`${input.fuzzyMatches.length} column mapping(s) reused via fuzzy match.`);
  }

  if (input.schemaMigration.unmapped.some(c => /assessment|quiz|score/i.test(c))) {
    insights.push('Risk metrics may be limited — assessment mapping missing or renamed.');
  }

  if (input.warnings.some(w => /sheet.*missing|empty/i.test(w))) {
    insights.push('Some sheets missing or empty — dashboard partially refreshed.');
  }

  if (input.requiresMappingReview) {
    insights.push('Mapping review recommended before relying on all KPIs.');
  }

  if (!insights.length && input.status === 'success') {
    insights.push('Sync completed with no schema warnings.');
  }

  return insights.slice(0, 8);
}

export function generateSyncHealthScore(input: {
  status: CloudWorkbookSyncResult['status'];
  warningCount: number;
  schemaMigration: SchemaMigrationSummary;
  parseErrors: number;
  fuzzyMatchCount: number;
}): SyncHealthScore {
  if (input.status === 'failed' || input.parseErrors > 0) return 'Critical';

  const instability =
    input.schemaMigration.added.length +
    input.schemaMigration.removed.length +
    input.schemaMigration.renamed.length;

  if (input.warningCount >= 5 || instability >= 5 || input.schemaMigration.unmapped.length >= 4) {
    return 'Critical';
  }

  if (input.status === 'warning' || input.warningCount >= 2 || instability >= 2) {
    return 'Warning';
  }

  if (input.warningCount === 1 || instability === 1) return 'Good';

  return 'Excellent';
}

export function scoreLabelColor(score: SyncHealthScore): string {
  switch (score) {
    case 'Excellent':
      return '#15803d';
    case 'Good':
      return '#2563eb';
    case 'Warning':
      return '#d97706';
    case 'Critical':
      return '#dc2626';
  }
}
