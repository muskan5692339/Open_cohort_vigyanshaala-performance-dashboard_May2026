import type { ColumnMapping } from './dynamicSchema';

export type FilterSelectMode = 'single' | 'multi';

/** Per-column filter selection. Empty array = no filter applied. */
export type GlobalFilterSelections = Record<string, string[]>;

export interface GlobalFilterState {
  selections: GlobalFilterSelections;
  /** Optional per-column mode override; defaults to multi for category, single for status. */
  modes: Record<string, FilterSelectMode>;
}

export interface FilterColumnMeta {
  column: string;
  mode: FilterSelectMode;
  options: string[];
}

export interface SavedFilterView {
  id: string;
  name: string;
  filters: GlobalFilterState;
  createdAt: string;
  updatedAt: string;
}

export type RiskActionType = 'note' | 'contacted' | 'follow_up' | 'resolved';

export interface RiskActionRecord {
  id: string;
  studentKey: string;
  studentLabel: string;
  actionType: RiskActionType;
  note?: string;
  createdAt: string;
}

export interface ExportMeta {
  exportedAt: string;
  recordCount: number;
  appliedFilters: GlobalFilterSelections;
  fileName?: string;
}

export interface DataQualityIssue {
  severity: 'warning' | 'error';
  category: 'missing_values' | 'duplicate_identifiers' | 'unmapped_columns' | 'low_confidence';
  message: string;
  details?: string;
}

export interface DataQualityReport {
  issues: DataQualityIssue[];
  missingValueCounts: Record<string, number>;
  duplicateIdentifierGroups: { column: string; value: string; count: number }[];
  unmappedColumns: string[];
  lowConfidenceColumns: { column: string; typeConfidence: number; roleConfidence: number }[];
}

export interface TableColumnConfig {
  id: string;
  visible: boolean;
}

export interface OperationalContext {
  mapping: ColumnMapping;
  rawRows: Record<string, string>[];
  fileName?: string;
}
