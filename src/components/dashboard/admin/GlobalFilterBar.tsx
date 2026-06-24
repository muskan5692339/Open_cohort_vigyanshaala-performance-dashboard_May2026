import { useMemo, useState } from 'react';
import { Filter, RotateCcw, Search, X } from 'lucide-react';
import type { ColumnMapping } from '../../../types/dynamicSchema';
import type { FilterColumnMeta, GlobalFilterState } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';
import {
  activeFilterChips,
  clearAllFilters,
  clearColumnFilter,
  getFilterMode,
  setFilterMode,
  toggleFilterValue,
} from '../../../services/globalFilters';

interface GlobalFilterBarProps {
  filterColumns: FilterColumnMeta[];
  filterState: GlobalFilterState;
  mapping: ColumnMapping;
  onChange: (next: GlobalFilterState) => void;
}

function FilterDropdown({
  meta,
  state,
  mapping,
  onChange,
}: {
  meta: FilterColumnMeta;
  state: GlobalFilterState;
  mapping: ColumnMapping;
  onChange: (next: GlobalFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const mode = getFilterMode(meta.column, mapping, state.modes);
  const selected = state.selections[meta.column] ?? [];

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meta.options;
    return meta.options.filter(o => o.toLowerCase().includes(q));
  }, [meta.options, search]);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.textLight, display: 'block', marginBottom: 4 }}>
        {meta.column}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '8px 10px',
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          background: '#fff',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: selected.length ? BRAND.text : BRAND.textLight,
        }}
      >
        {selected.length === 0 ? 'All' : mode === 'single' ? selected[0] : `${selected.length} selected`}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            zIndex: 30,
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${BRAND.border}` }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => onChange(setFilterMode(state, meta.column, 'single'))}
                style={modeBtn(mode === 'single')}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => onChange(setFilterMode(state, meta.column, 'multi'))}
                style={modeBtn(mode === 'multi')}
              >
                Multi
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '4px 8px' }}>
              <Search size={12} color={BRAND.textLight} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search values…"
                style={{ border: 'none', outline: 'none', fontSize: 12, width: '100%', fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 180 }}>
            {options.map(opt => (
              <label
                key={opt}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
              >
                <input
                  type={mode === 'single' ? 'radio' : 'checkbox'}
                  checked={selected.includes(opt)}
                  onChange={() => onChange(toggleFilterValue(state, meta.column, opt, mapping))}
                />
                {opt}
              </label>
            ))}
            {options.length === 0 && (
              <div style={{ padding: 10, fontSize: 12, color: BRAND.textLight }}>No matching values</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '4px 8px',
    fontSize: 11,
    borderRadius: 6,
    border: `1px solid ${BRAND.border}`,
    background: active ? BRAND.navy : '#fff',
    color: active ? '#fff' : BRAND.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

export default function GlobalFilterBar({ filterColumns, filterState, mapping, onChange }: GlobalFilterBarProps) {
  const chips = activeFilterChips(filterState);

  if (!filterColumns.length) return null;

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: BRAND.text }}>
          <Filter size={16} /> Global Filters
        </div>
        <button
          type="button"
          onClick={() => onChange(clearAllFilters())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            background: '#fff',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: BRAND.textLight,
          }}
        >
          <RotateCcw size={12} /> Clear all
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {filterColumns.map(col => (
          <FilterDropdown
            key={col.column}
            meta={col}
            state={filterState}
            mapping={mapping}
            onChange={onChange}
          />
        ))}
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {chips.map(chip => (
            <span
              key={`${chip.column}-${chip.value}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                fontSize: 12,
                color: '#1e40af',
              }}
            >
              <strong>{chip.column}:</strong> {chip.value}
              <button
                type="button"
                onClick={() => {
                  const current = filterState.selections[chip.column] ?? [];
                  const nextVals = current.filter(v => v !== chip.value);
                  onChange(
                    nextVals.length
                      ? { ...filterState, selections: { ...filterState.selections, [chip.column]: nextVals } }
                      : clearColumnFilter(filterState, chip.column),
                  );
                }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex' }}
                aria-label={`Remove filter ${chip.column}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
