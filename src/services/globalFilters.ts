import type { ColumnMapping } from '../types/dynamicSchema';
import type {
  FilterColumnMeta,
  FilterSelectMode,
  GlobalFilterSelections,
  GlobalFilterState,
} from '../types/opsTypes';

type RawRow = Record<string, string>;

export const EMPTY_GLOBAL_FILTERS: GlobalFilterState = {
  selections: {},
  modes: {},
};

function defaultModeForColumn(column: string, mapping: ColumnMapping): FilterSelectMode {
  const type = mapping[column]?.mappedType;
  return type === 'status' ? 'single' : 'multi';
}

/** Build filterable columns from mapped category + status columns. */
export function buildFilterColumns(
  rows: RawRow[],
  mapping: ColumnMapping,
): FilterColumnMeta[] {
  const cols = Object.entries(mapping)
    .filter(([, m]) => m.mappedType === 'category' || m.mappedType === 'status')
    .map(([column]) => column);

  const optionSets = new Map<string, Set<string>>();
  for (const col of cols) optionSets.set(col, new Set());

  for (const row of rows) {
    for (const col of cols) {
      const v = (row[col] ?? '').trim();
      if (v) optionSets.get(col)!.add(v);
    }
  }

  return cols.map(column => ({
    column,
    mode: defaultModeForColumn(column, mapping),
    options: [...(optionSets.get(column) ?? [])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    ),
  }));
}

export function getFilterMode(
  column: string,
  mapping: ColumnMapping,
  modes: Record<string, FilterSelectMode>,
): FilterSelectMode {
  return modes[column] ?? defaultModeForColumn(column, mapping);
}

export function toggleFilterValue(
  state: GlobalFilterState,
  column: string,
  value: string,
  mapping: ColumnMapping,
): GlobalFilterState {
  const mode = getFilterMode(column, mapping, state.modes);
  const current = state.selections[column] ?? [];

  if (mode === 'single') {
    const next = current.includes(value) ? [] : [value];
    return {
      ...state,
      selections: { ...state.selections, [column]: next },
    };
  }

  const next = current.includes(value)
    ? current.filter(v => v !== value)
    : [...current, value];

  return {
    ...state,
    selections: { ...state.selections, [column]: next },
  };
}

export function setFilterMode(
  state: GlobalFilterState,
  column: string,
  mode: FilterSelectMode,
): GlobalFilterState {
  const selections = { ...state.selections };
  if (mode === 'single' && (selections[column]?.length ?? 0) > 1) {
    selections[column] = selections[column].slice(0, 1);
  }
  return {
    ...state,
    modes: { ...state.modes, [column]: mode },
    selections,
  };
}

export function clearAllFilters(): GlobalFilterState {
  return EMPTY_GLOBAL_FILTERS;
}

export function clearColumnFilter(state: GlobalFilterState, column: string): GlobalFilterState {
  const selections = { ...state.selections };
  delete selections[column];
  return { ...state, selections };
}

/** O(n * f) filter — optimized for 5k+ rows with early exit per row. */
export function applyGlobalFilters(rows: RawRow[], mapping: ColumnMapping, state: GlobalFilterState): RawRow[] {
  const active = Object.entries(state.selections).filter(([, vals]) => vals.length > 0);
  if (!active.length) return rows;

  return rows.filter(row =>
    active.every(([column, vals]) => {
      const cell = (row[column] ?? '').trim();
      const mode = getFilterMode(column, mapping, state.modes);
      if (mode === 'single') return cell === vals[0];
      return vals.includes(cell);
    }),
  );
}

export function activeFilterChips(
  state: GlobalFilterState,
): { column: string; value: string }[] {
  const chips: { column: string; value: string }[] = [];
  for (const [column, vals] of Object.entries(state.selections)) {
    for (const value of vals) chips.push({ column, value });
  }
  return chips;
}

export function filtersSummaryLabel(selections: GlobalFilterSelections): string {
  const chips = Object.entries(selections).flatMap(([col, vals]) =>
    vals.map(v => `${col}: ${v}`),
  );
  return chips.length ? chips.join('; ') : 'None';
}
