import { useMemo } from 'react';
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Award,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
} from 'lucide-react';
import type { RiskStudent, RiskType } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';
import AnalyticsShell from '../../shared/AnalyticsShell';

interface RiskSection {
  type: RiskType;
  title: string;
  description: string;
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
}

const SECTIONS: RiskSection[] = [
  {
    type: 'Low Attendance',
    title: 'Low Attendance',
    description: 'Students attending less than 70% of sessions.',
    icon: Calendar,
    color: BRAND.red,
    bg: BRAND.redLight,
  },
  {
    type: 'Assignment Backlog',
    title: 'Assignment Backlog',
    description: 'Submitted less than 50% of assignments to date.',
    icon: ClipboardList,
    color: BRAND.yellowDark,
    bg: BRAND.yellowLight,
  },
  {
    type: 'Low Quiz Performance',
    title: 'Low Quiz Performance',
    description: 'Quiz average has fallen below 50%.',
    icon: Award,
    color: BRAND.blue,
    bg: BRAND.blueLight,
  },
  {
    type: 'Attend But Not Submit',
    title: 'Attend But Not Submit',
    description: 'High attendance (> 80%) but submitting under 40% of work.',
    icon: ArrowDownRight,
    color: '#a855f7',
    bg: '#f3e8ff',
  },
  {
    type: 'Submit But Low Attendance',
    title: 'Submit But Low Attendance',
    description: 'Submitting well but attending under 60% of sessions.',
    icon: ArrowUpRight,
    color: '#0ea5e9',
    bg: '#e0f2fe',
  },
  {
    type: 'High Risk',
    title: 'High Risk',
    description: 'Behind on attendance, assignments and quizzes.',
    icon: Flame,
    color: '#dc2626',
    bg: BRAND.redLight,
  },
];

function StudentRow({ s }: { s: RiskStudent }) {
  return (
    <tr style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
      <td style={{ padding: '10px 12px', fontWeight: 600, color: BRAND.text }}>{s.name}</td>
      <td style={{ padding: '10px 12px', color: BRAND.textLight, fontSize: 12 }}>{s.email}</td>
      <td style={{ padding: '10px 12px', color: BRAND.text }}>{s.cohort}</td>
      <td style={{ padding: '10px 12px', color: BRAND.text }}>{s.attendance}%</td>
      <td style={{ padding: '10px 12px', color: BRAND.text }}>{s.assignmentCompletion}%</td>
      <td style={{ padding: '10px 12px', color: BRAND.text }}>{s.quizAverage}</td>
      <td style={{ padding: '10px 12px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            background: BRAND.redLight,
            color: BRAND.red,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {s.riskScore}/100
        </span>
      </td>
      <td style={{ padding: '10px 12px', color: BRAND.textLight, fontSize: 12 }}>
        {s.suggestedAction}
      </td>
    </tr>
  );
}

interface RiskPanelProps {
  riskStudents: RiskStudent[];
  loading?: boolean;
  error?: string | null;
}

export default function RiskPanel({ riskStudents, loading, error }: RiskPanelProps) {
  const groups = useMemo(() => {
    const map = new Map<RiskType, RiskStudent[]>();
    SECTIONS.forEach(s => map.set(s.type, []));
    riskStudents.forEach(s => {
      const arr = map.get(s.riskType);
      if (arr) arr.push(s);
    });
    return map;
  }, [riskStudents]);

  return (
    <AnalyticsShell
      loading={loading}
      error={error}
      empty={!riskStudents.length}
      emptyMessage="No students currently match intervention risk criteria."
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {SECTIONS.map(section => {
            const list = groups.get(section.type) ?? [];
            const Icon = section.icon;
            return (
              <div
                key={section.type}
                style={{
                  background: BRAND.card,
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: section.bg,
                      color: section.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: BRAND.textLight, fontWeight: 600 }}>
                      {section.title}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
                      {list.length}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {SECTIONS.map(section => {
          const list = groups.get(section.type) ?? [];
          const Icon = section.icon;
          return (
            <div
              key={section.type}
              style={{
                background: BRAND.card,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '14px 18px',
                  borderBottom: `1px solid ${BRAND.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: section.bg,
                    color: section.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
                    {section.title}{' '}
                    <span style={{ color: BRAND.textLight, fontWeight: 500 }}>({list.length})</span>
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
                    {section.description}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: BRAND.bg }}>
                    <tr>
                      {['Student', 'Email', 'Cohort', 'Att%', 'Asn%', 'Quiz', 'Risk', 'Suggested Action'].map(
                        h => (
                          <th
                            key={h}
                            style={{
                              padding: '10px 12px',
                              textAlign: 'left',
                              fontSize: 11,
                              color: BRAND.textLight,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: 24,
                            textAlign: 'center',
                            color: BRAND.textLight,
                            fontSize: 13,
                          }}
                        >
                          No students currently in this category.
                        </td>
                      </tr>
                    ) : (
                      list.map(s => <StudentRow key={s.studentId} s={s} />)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </AnalyticsShell>
  );
}
