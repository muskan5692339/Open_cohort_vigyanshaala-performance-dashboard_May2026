import { useMemo, useState } from 'react';
import type {
  BusinessRole,
  ColumnType,
  DiscoveredColumn,
  DisplayGroup,
} from '../../types/dynamicSchema';

interface Props {
  columns: DiscoveredColumn[];
  onChange: (next: DiscoveredColumn[]) => void;
}

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: 'identifier', label: 'Identifier' },
  { value: 'category', label: 'Category' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'status', label: 'Status' },
  { value: 'text', label: 'Text' },
  { value: 'ignore', label: 'Ignore' },
];

const ROLE_OPTIONS: { value: BusinessRole; label: string }[] = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'certification', label: 'Certification' },
  { value: 'participation', label: 'Participation' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'demographic', label: 'Demographic' },
  { value: 'academic', label: 'Academic' },
  { value: 'program', label: 'Program' },
  { value: 'custom', label: 'Custom' },
  { value: 'none', label: 'None' },
];

const GROUP_OPTIONS: { value: DisplayGroup; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'performance', label: 'Performance' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'certification', label: 'Certification' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'academic', label: 'Academic' },
  { value: 'program', label: 'Program' },
  { value: 'custom', label: 'Custom' },
];

const FILTER_TYPES = ['all', ...TYPE_OPTIONS.map(o => o.value)] as const;
const FILTER_ROLES = ['all', ...ROLE_OPTIONS.map(o => o.value)] as const;
const FILTER_GROUPS = ['all', ...GROUP_OPTIONS.map(o => o.value)] as const;

const BRAND = {
  border: '#e5e7eb',
  bg: '#f9fafb',
  text: '#111827',
  textLight: '#6b7280',
  navy: '#1e2d45',
};

function confidenceBadge(value: number) {
  if (value > 0.8) return { label: 'High', bg: '#dcfce7', fg: '#166534' };
  if (value >= 0.5) return { label: 'Medium', bg: '#fef3c7', fg: '#92400e' };
  return { label: 'Low', bg: '#fee2e2', fg: '#991b1b' };
}

export default function ColumnMappingTable({ columns, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof FILTER_TYPES)[number]>('all');
  const [roleFilter, setRoleFilter] = useState<(typeof FILTER_ROLES)[number]>('all');
  const [groupFilter, setGroupFilter] = useState<(typeof FILTER_GROUPS)[number]>('all');

  const visibleColumns = useMemo(() => {
    return columns.filter(col => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        col.name.toLowerCase().includes(q) ||
        col.sampleValues.some(v => v.toLowerCase().includes(q));
      const matchesType = typeFilter === 'all' || col.mappedType === typeFilter;
      const matchesRole = roleFilter === 'all' || col.mappedRole === roleFilter;
      const matchesGroup = groupFilter === 'all' || col.mappedDisplayGroup === groupFilter;
      return matchesSearch && matchesType && matchesRole && matchesGroup;
    });
  }, [columns, search, typeFilter, roleFilter, groupFilter]);

  const updateColumn = (name: string, patch: Partial<DiscoveredColumn>) => {
    const next = columns.map(col => {
      if (col.name !== name) return col;
      const merged = { ...col, ...patch };
      if (merged.mappedType === 'ignore') {
        merged.mappedRole = 'none';
      }
      if (merged.mappedType === 'identifier') {
        merged.mappedDisplayGroup = 'profile';
      }
      return merged;
    });
    onChange(next);
  };

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, background: '#fff' }}>
      <div
        style={{
          padding: 14,
          borderBottom: `1px solid ${BRAND.border}`,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          gap: 10,
        }}
      >
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search columns or sample values..."
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}` }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as (typeof FILTER_TYPES)[number])}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}` }}
        >
          {FILTER_TYPES.map(opt => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Types' : opt}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as (typeof FILTER_ROLES)[number])}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}` }}
        >
          {FILTER_ROLES.map(opt => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Roles' : opt}
            </option>
          ))}
        </select>
        <select
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value as (typeof FILTER_GROUPS)[number])}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}` }}
        >
          {FILTER_GROUPS.map(opt => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Groups' : opt}
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflow: 'auto', maxHeight: 480 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1300 }}>
          <thead style={{ position: 'sticky', top: 0, background: BRAND.bg, zIndex: 1 }}>
            <tr>
              {[
                'Column Name',
                'Sample Values',
                'Detected Type',
                'Type Confidence',
                'Detected Role',
                'Role Confidence',
                'Detected Display Group',
                'Display Group Confidence',
                'Mapped Type',
                'Mapped Role',
                'Mapped Display Group',
              ].map(h => (
                <th
                  key={h}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    color: BRAND.textLight,
                    borderBottom: `1px solid ${BRAND.border}`,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleColumns.map(col => {
              const tc = confidenceBadge(col.typeConfidence);
              const rc = confidenceBadge(col.roleConfidence);
              const gc = confidenceBadge(col.displayGroupConfidence);
              const disableGroup = col.mappedType === 'ignore';
              return (
                <tr key={col.name} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: BRAND.navy }}>{col.name}</td>
                  <td style={{ padding: '8px 10px', color: BRAND.text }}>
                    {col.sampleValues.slice(0, 3).join(' | ') || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: BRAND.text }}>{col.inferredType}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: tc.bg, color: tc.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                      {tc.label} ({col.typeConfidence.toFixed(2)})
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: BRAND.text }}>{col.inferredRole}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: rc.bg, color: rc.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                      {rc.label} ({col.roleConfidence.toFixed(2)})
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: BRAND.text }}>{col.inferredDisplayGroup}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: gc.bg, color: gc.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                      {gc.label} ({col.displayGroupConfidence.toFixed(2)})
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      value={col.mappedType}
                      onChange={e => updateColumn(col.name, { mappedType: e.target.value as ColumnType })}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}` }}
                    >
                      {TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      value={col.mappedRole}
                      onChange={e => updateColumn(col.name, { mappedRole: e.target.value as BusinessRole })}
                      disabled={col.mappedType === 'ignore'}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}` }}
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      value={col.mappedDisplayGroup}
                      onChange={e => updateColumn(col.name, { mappedDisplayGroup: e.target.value as DisplayGroup })}
                      disabled={disableGroup}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}` }}
                    >
                      {GROUP_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
