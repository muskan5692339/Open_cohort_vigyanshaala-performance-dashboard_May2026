import { useMemo, useState } from 'react';
import { Search, Download, ChevronUp, ChevronDown, Eye } from 'lucide-react';
import type { Student, RiskCategory } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';

interface StudentTableProps {
  students: Student[];
  pageSize?: number;
}

type SortKey =
  | 'name'
  | 'email'
  | 'college'
  | 'cohort'
  | 'attendance'
  | 'assignmentCompletion'
  | 'quizAverage'
  | 'engagementScore'
  | 'riskCategory';

type SortDirection = 'asc' | 'desc';

const RISK_STYLES: Record<RiskCategory, { bg: string; color: string }> = {
  Excellent: { bg: BRAND.greenLight, color: BRAND.greenDark },
  Good: { bg: BRAND.blueLight, color: BRAND.blue },
  'Needs Attention': { bg: BRAND.yellowLight, color: BRAND.yellowDark },
  'At Risk': { bg: BRAND.redLight, color: BRAND.red },
};

function downloadCSV(students: Student[]) {
  const header = [
    'ID',
    'Name',
    'Email',
    'College',
    'Cohort',
    'Program',
    'State',
    'Attendance %',
    'Assignment %',
    'Quiz Avg',
    'Engagement',
    'Risk Category',
    'Status',
  ];
  const rows = students.map(s => [
    s.id,
    s.name,
    s.email,
    s.college,
    s.cohort,
    s.program,
    s.state,
    s.attendance,
    s.assignmentCompletion,
    s.quizAverage,
    s.engagementScore,
    s.riskCategory,
    s.status,
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vigyanshaala-students-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function StudentTable({ students, pageSize = 20 }: StudentTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.college.toLowerCase().includes(q) ||
        s.cohort.toLowerCase().includes(q),
    );
  }, [students, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const renderHeader = (label: string, key: SortKey) => {
    const active = sortKey === key;
    return (
      <th
        onClick={() => onSort(key)}
        style={{
          padding: '12px 14px',
          textAlign: 'left',
          fontSize: 12,
          color: BRAND.textLight,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          borderBottom: `1px solid ${BRAND.border}`,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          {active && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </span>
      </th>
    );
  };

  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          gap: 12,
          borderBottom: `1px solid ${BRAND.border}`,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 8,
              padding: '6px 10px',
              background: BRAND.bg,
              minWidth: 280,
            }}
          >
            <Search size={14} color={BRAND.textLight} />
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, college, cohort..."
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                width: '100%',
                color: BRAND.text,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: BRAND.textLight }}>
            {sorted.length} result{sorted.length === 1 ? '' : 's'}
          </span>
        </div>

        <button
          onClick={() => downloadCSV(sorted)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: BRAND.green,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: BRAND.bg }}>
            <tr>
              <th
                style={{
                  padding: '12px 14px',
                  textAlign: 'left',
                  fontSize: 12,
                  color: BRAND.textLight,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  borderBottom: `1px solid ${BRAND.border}`,
                  width: 50,
                }}
              >
                #
              </th>
              {renderHeader('Student Name', 'name')}
              {renderHeader('Email', 'email')}
              {renderHeader('College', 'college')}
              {renderHeader('Cohort', 'cohort')}
              {renderHeader('Attendance%', 'attendance')}
              {renderHeader('Assignment%', 'assignmentCompletion')}
              {renderHeader('Quiz Avg', 'quizAverage')}
              {renderHeader('Engagement', 'engagementScore')}
              {renderHeader('Risk Category', 'riskCategory')}
              <th
                style={{
                  padding: '12px 14px',
                  textAlign: 'left',
                  fontSize: 12,
                  color: BRAND.textLight,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  borderBottom: `1px solid ${BRAND.border}`,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s, idx) => {
              const style = RISK_STYLES[s.riskCategory];
              return (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: `1px solid ${BRAND.borderLight}`,
                    background: idx % 2 === 0 ? BRAND.card : 'rgba(248,250,252,0.5)',
                  }}
                >
                  <td style={{ padding: '12px 14px', color: BRAND.textLight, fontSize: 12 }}>
                    {start + idx + 1}
                  </td>
                  <td style={{ padding: '12px 14px', color: BRAND.text, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '12px 14px', color: BRAND.textLight, fontSize: 12 }}>{s.email}</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text }}>{s.college}</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text }}>{s.cohort}</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text }}>{s.attendance}%</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text }}>{s.assignmentCompletion}%</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text }}>{s.quizAverage}</td>
                  <td style={{ padding: '12px 14px', color: BRAND.text, fontWeight: 600 }}>
                    {s.engagementScore}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: style.bg,
                        color: style.color,
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {s.riskCategory}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'transparent',
                        color: BRAND.navy,
                        border: `1px solid ${BRAND.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  style={{ padding: 40, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}
                >
                  No students match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: `1px solid ${BRAND.border}`,
          fontSize: 12,
          color: BRAND.textLight,
        }}
      >
        <span>
          Showing {sorted.length === 0 ? 0 : start + 1}-{Math.min(start + pageSize, sorted.length)} of {sorted.length}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '6px 12px',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 6,
              background: BRAND.card,
              fontSize: 12,
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            Previous
          </button>
          <span style={{ padding: '0 8px' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '6px 12px',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 6,
              background: BRAND.card,
              fontSize: 12,
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
