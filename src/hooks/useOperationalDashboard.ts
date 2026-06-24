import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { generateDynamicAnalytics, type DynamicAnalyticsResult } from '../services/dynamicAnalytics';
import {
  applyGlobalFilters,
  buildFilterColumns,
  EMPTY_GLOBAL_FILTERS,
} from '../services/globalFilters';
import type { FilterColumnMeta, GlobalFilterState, DataQualityReport } from '../types/opsTypes';
import { buildDataQualityReport } from '../services/dataQualityReport';
import type { ColumnMapping, DiscoveredColumn } from '../types/dynamicSchema';
import { measureAnalytics } from '../services/dashboardHealthMonitor';
import { filterSignature } from '../services/performanceUtils';

type RawRow = Record<string, string>;

export interface OperationalDashboardData {
  filterState: GlobalFilterState;
  setFilterState: (next: GlobalFilterState | ((prev: GlobalFilterState) => GlobalFilterState)) => void;
  filterColumns: FilterColumnMeta[];
  filteredRows: RawRow[];
  deferredFilteredRows: RawRow[];
  activeAnalytics: DynamicAnalyticsResult | null;
  dataQuality: DataQualityReport;
  tableColumns: string[];
}

export function useOperationalDashboard(input: {
  rawRows: RawRow[];
  mapping: ColumnMapping | undefined;
  headers?: string[];
  discoveredColumns?: DiscoveredColumn[];
  baseAnalytics: DynamicAnalyticsResult | null;
}): OperationalDashboardData {
  const { rawRows, mapping, headers, discoveredColumns, baseAnalytics } = input;
  const [filterState, setFilterState] = useState<GlobalFilterState>(EMPTY_GLOBAL_FILTERS);

  const filterColumns = useMemo(() => {
    if (!mapping) return [] as FilterColumnMeta[];
    return buildFilterColumns(rawRows, mapping);
  }, [rawRows, mapping]);

  const filteredRows = useMemo(() => {
    if (!mapping) return rawRows;
    return applyGlobalFilters(rawRows, mapping, filterState);
  }, [rawRows, mapping, filterState]);

  const filterSig = useMemo(() => filterSignature(filterState.selections), [filterState.selections]);
  const hasActiveFilters = filterSig !== '[]' && filterSig !== '{}';

  const deferredFilteredRows = useDeferredValue(filteredRows);

  const activeAnalytics = useMemo(() => {
    if (!mapping) return baseAnalytics;
    if (!hasActiveFilters && filteredRows.length === rawRows.length && baseAnalytics) return baseAnalytics;
    return measureAnalytics(filteredRows.length, () =>
      generateDynamicAnalytics(filteredRows, mapping),
    );
  }, [mapping, filteredRows, rawRows.length, baseAnalytics, hasActiveFilters]);

  const dataQuality = useMemo(
    () => buildDataQualityReport(rawRows, mapping, headers, discoveredColumns),
    [rawRows, mapping, headers, discoveredColumns],
  );

  const tableColumns = useMemo(() => {
    if (!mapping) return [] as string[];
    return Object.entries(mapping)
      .filter(([, m]) => m.mappedType !== 'ignore')
      .map(([col]) => col);
  }, [mapping]);

  const stableSetFilterState = useCallback(
    (next: GlobalFilterState | ((prev: GlobalFilterState) => GlobalFilterState)) => {
      setFilterState(next);
    },
    [],
  );

  return {
    filterState,
    setFilterState: stableSetFilterState,
    filterColumns,
    filteredRows,
    deferredFilteredRows,
    activeAnalytics,
    dataQuality,
    tableColumns,
  };
}
