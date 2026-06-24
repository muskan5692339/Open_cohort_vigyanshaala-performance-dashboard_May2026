import { useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Columns3, Download, GripVertical, Search } from 'lucide-react';
import type { DynamicAnalyticsResult } from '../../../services/dynamicAnalytics';
import type { ExportMeta } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';
import { buildExportMeta, exportStudentTableCsv, exportStudentTableXlsx } from '../../../services/exportService';

const TABLE_PREFS_KEY = 'vs_student_table_prefs_v1';

interface TablePrefs {
  columnOrder: string[];
  hiddenColumns: string[];
}

interface DynamicStudentTableProps {
  rows: Record<string, string>[];
  allColumns: string[];
  riskByKey?: Map<string, DynamicAnalyticsResult['riskMetrics']['students'][0]>;
  appliedFilters: ExportMeta['appliedFilters'];
  fileName?: string;
  pageSize?: number;
}

function loadPrefs(allColumns: string[]): TablePrefs {
  try {
    const raw = localStorage.getItem(TABLE_PREFS_KEY);
    if (!raw) return { columnOrder: allColumns, hiddenColumns: [] };
    const parsed = JSON.parse(raw) as TablePrefs;
    const order = parsed.columnOrder.filter(c => allColumns.includes(c));
    for (const c of allColumns) if (!order.includes(c)) order.push(c);
    return { columnOrder: order, hiddenColumns: parsed.hiddenColumns.filter(c => allColumns.includes(c)) };
  } catch {
    return { columnOrder: allColumns, hiddenColumns: [] };
  }
}

function savePrefs(prefs: TablePrefs) {
  localStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(prefs));
}

export default function DynamicStudentTable({
  rows,
  allColumns,
  riskByKey,
  appliedFilters,
  fileName,
  pageSize = 25,
}: DynamicStudentTableProps) {
  const [prefs, setPrefs] = useState<TablePrefs>(() => loadPrefs(allColumns));
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [sortCol, setSortCol] = useState(allColumns[0] ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [showColumns, setShowColumns] = useState(false);
  const [dragCol, setDragCol] = useState<string | null>(null);

  const visibleColumns = useMemo(
    () => prefs.columnOrder.filter(c => !prefs.hiddenColumns.includes(c)),
    [prefs],
  );

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      visibleColumns.some(col => (row[col] ?? '').toLowerCase().includes(q)),
    );
  }, [rows, deferredSearch, visibleColumns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn) && av !== '' && bv !== '') {
        return sortDir === 'asc' ? an - bn : bn - an;
      }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const toggleColumn = (col: string) => {
    setPrefs(prev => {
      const hidden = prev.hiddenColumns.includes(col)
        ? prev.hiddenColumns.filter(c => c !== col)
        : [...prev.hiddenColumns, col];
      const next = { ...prev, hiddenColumns: hidden };
      savePrefs(next);
      return next;
    });
  };

  const moveColumn = (from: string, to: string) => {
    if (from === to) return;
    setPrefs(prev => {
      const order = [...prev.columnOrder];
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, from);
      const next = { ...prev, columnOrder: order };
      savePrefs(next);
      return next;
    });
  };

  const exportTable = async (format: 'csv' | 'xlsx') => {
    const meta = buildExportMeta(sorted.length, appliedFilters, fileName);
    if (format === 'csv') await exportStudentTableCsv(sorted, visibleColumns, meta);
    else await exportStudentTableXlsx(sorted, visibleColumns, meta);
  };

  const onSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 14, borderBottom: `1px solid ${BRAND.border}`, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '6px 10px', minWidth: 260, flex: 1 }}>
          <Search size={14} color={BRAND.textLight} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search all visible columns…"
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <span style={{ fontSize: 12, color: BRAND.textLight }}>{sorted.length} students</span>
        <button type="button" onClick={() => setShowColumns(v => !v)} style={toolbarBtn}>
          <Columns3 size={14} /> Columns
        </button>
        <button type="button" onClick={() => exportTable('csv')} style={toolbarBtn}>
          <Download size={14} /> CSV
        </button>
        <button type="button" onClick={() => exportTable('xlsx')} style={{ ...toolbarBtn, background: BRAND.green, color: '#fff', border: 'none' }}>
          <Download size={14} /> Excel
        </button>
      </div>

      {showColumns && (
        <div style={{ padding: 12, borderBottom: `1px solid ${BRAND.border}`, background: BRAND.bg }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Show / hide & reorder</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {prefs.columnOrder.map(col => (
              <div
                key={col}
                draggable
                onDragStart={() => setDragCol(col)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragCol) moveColumn(dragCol, col); setDragCol(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
              >
                <GripVertical size={14} color={BRAND.textLight} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!prefs.hiddenColumns.includes(col)} onChange={() => toggleColumn(col)} />
                  {col}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ background: BRAND.bg }}>
            <tr>
              <th style={thStyle}>#</th>
              {visibleColumns.map(col => (
                <th key={col} style={{ ...thStyle, cursor: 'pointer' }} onClick={() => onSort(col)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col}
                    {sortCol === col && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
              {riskByKey && <th style={thStyle}>Risk</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => {
              const identity = visibleColumns.map(c => row[c]).find(Boolean) ?? `row-${start + idx}`;
              const risk =
                riskByKey?.get(identity) ??
                riskByKey?.get(identity.toLowerCase()) ??
                Object.values(row).map(v => riskByKey?.get(v) ?? riskByKey?.get(v.toLowerCase())).find(Boolean);
              return (
                <tr key={`${start + idx}-${identity}`} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                  <td style={tdStyle}>{start + idx + 1}</td>
                  {visibleColumns.map(col => (
                    <td key={col} style={tdStyle}>{row[col] ?? '—'}</td>
                  ))}
                  {riskByKey && (
                    <td style={tdStyle}>
                      {risk ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: risk.category.includes('Risk') ? BRAND.red : BRAND.text }}>
                          {risk.category} ({risk.score})
                        </span>
                      ) : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + (riskByKey ? 2 : 1)} style={{ padding: 32, textAlign: 'center', color: BRAND.textLight }}>
                  No students match the current filters or search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 12, color: BRAND.textLight }}>
        <span>
          Showing {sorted.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(p => p - 1)} style={pageBtn(currentPage === 1)}>Previous</button>
          <span style={{ padding: '0 8px' }}>Page {currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(p => p + 1)} style={pageBtn(currentPage === totalPages)}>Next</button>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: BRAND.textLight,
  textTransform: 'uppercase',
  borderBottom: `1px solid ${BRAND.border}`,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: BRAND.text,
  verticalAlign: 'top',
};

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  background: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    border: `1px solid ${BRAND.border}`,
    borderRadius: 6,
    background: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
  };
}
