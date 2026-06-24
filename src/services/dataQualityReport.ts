import type { ColumnMapping, DiscoveredColumn } from '../types/dynamicSchema';
import type { DataQualityReport } from '../types/opsTypes';

type RawRow = Record<string, string>;

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function buildDataQualityReport(
  rows: RawRow[],
  mapping: ColumnMapping | undefined,
  headers: string[] | undefined,
  discoveredColumns: DiscoveredColumn[] | undefined,
): DataQualityReport {
  const issues: DataQualityReport['issues'] = [];
  const missingValueCounts: Record<string, number> = {};
  const duplicateIdentifierGroups: DataQualityReport['duplicateIdentifierGroups'] = [];
  const unmappedColumns: string[] = [];
  const lowConfidenceColumns: DataQualityReport['lowConfidenceColumns'] = [];

  if (!mapping || !rows.length) {
    return { issues, missingValueCounts, duplicateIdentifierGroups, unmappedColumns, lowConfidenceColumns };
  }

  const mappedCols = Object.keys(mapping).filter(c => mapping[c].mappedType !== 'ignore');

  for (const col of mappedCols) {
    const missing = rows.filter(r => !(r[col] ?? '').trim()).length;
    if (missing > 0) {
      missingValueCounts[col] = missing;
      const pct = Math.round((missing / rows.length) * 100);
      if (pct >= 20) {
        issues.push({
          severity: 'warning',
          category: 'missing_values',
          message: `${col}: ${missing} rows (${pct}%) missing values`,
        });
      }
    }
  }

  const idCols = mappedCols.filter(c => mapping[c].mappedType === 'identifier');
  for (const col of idCols) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = (row[col] ?? '').trim().toLowerCase();
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const [value, count] of counts) {
      if (count > 1) {
        duplicateIdentifierGroups.push({ column: col, value, count });
        issues.push({
          severity: 'error',
          category: 'duplicate_identifiers',
          message: `Duplicate ${col}: "${value}" appears ${count} times`,
        });
      }
    }
  }

  if (headers?.length) {
    for (const h of headers) {
      if (!mapping[h]) {
        unmappedColumns.push(h);
        issues.push({
          severity: 'warning',
          category: 'unmapped_columns',
          message: `Column "${h}" is not mapped`,
        });
      }
    }
  }

  if (discoveredColumns?.length) {
    for (const dc of discoveredColumns) {
      const lowType = dc.typeConfidence < LOW_CONFIDENCE_THRESHOLD;
      const lowRole = dc.roleConfidence < LOW_CONFIDENCE_THRESHOLD;
      if (lowType || lowRole) {
        lowConfidenceColumns.push({
          column: dc.name,
          typeConfidence: dc.typeConfidence,
          roleConfidence: dc.roleConfidence,
        });
        issues.push({
          severity: 'warning',
          category: 'low_confidence',
          message: `Low-confidence mapping for "${dc.name}" (type ${Math.round(dc.typeConfidence * 100)}%, role ${Math.round(dc.roleConfidence * 100)}%)`,
        });
      }
    }
  }

  return {
    issues,
    missingValueCounts,
    duplicateIdentifierGroups,
    unmappedColumns,
    lowConfidenceColumns,
  };
}
