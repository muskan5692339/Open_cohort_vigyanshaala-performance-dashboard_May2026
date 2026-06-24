import { TrendingUp, TrendingDown, AlertCircle, Sparkles, PhoneCall, type LucideIcon } from 'lucide-react';
import type { WeeklyChange, WeeklyMovement } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';
import AnalyticsShell from '../../shared/AnalyticsShell';

function ChangeCard({
  metric,
  current,
  previous,
  change,
  unit,
}: WeeklyChange) {
  const positive = change >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 12, color: BRAND.textLight, fontWeight: 600 }}>{metric}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
          {current}
          {unit}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: positive ? BRAND.greenLight : BRAND.redLight,
            color: positive ? BRAND.greenDark : BRAND.red,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <Icon size={12} />
          {positive ? '+' : ''}
          {change}
          {unit}
        </div>
      </div>
      <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 6 }}>
        Previous week: {previous}
        {unit}
      </div>
    </div>
  );
}

function MovementTable({
  title,
  description,
  rows,
  icon: Icon,
  color,
  bg,
  variant,
}: {
  title: string;
  description: string;
  rows: WeeklyMovement[];
  icon: LucideIcon;
  color: string;
  bg: string;
  variant: 'risk' | 'improved' | 'followup';
}) {
  return (
    <div
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
            background: bg,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={16} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
            {title} <span style={{ color: BRAND.textLight, fontWeight: 500 }}>({rows.length})</span>
          </div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>{description}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: BRAND.bg }}>
            <tr>
              {['Student', 'Cohort', 'Previous', 'Current', 'Δ', variant === 'followup' ? 'Action' : 'Reason'].map(
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>
                  No students in this list this week.
                </td>
              </tr>
            ) : (
              rows.map(r => {
                const positive = r.delta >= 0;
                return (
                  <tr key={r.studentId} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                    <td style={{ padding: '10px 12px', color: BRAND.text, fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.text }}>{r.cohort}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.textLight }}>{r.previousScore}</td>
                    <td style={{ padding: '10px 12px', color: BRAND.text, fontWeight: 600 }}>{r.currentScore}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 999,
                          background: positive ? BRAND.greenLight : BRAND.redLight,
                          color: positive ? BRAND.greenDark : BRAND.red,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        {positive ? '+' : ''}
                        {r.delta}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: BRAND.textLight, fontSize: 12 }}>{r.reason}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface WeeklyOpsProps {
  weeklyChanges: WeeklyChange[];
  newlyAtRisk: WeeklyMovement[];
  improvedStudents: WeeklyMovement[];
  followUpStudents: WeeklyMovement[];
  loading?: boolean;
  error?: string | null;
}

export default function WeeklyOps({
  weeklyChanges,
  newlyAtRisk,
  improvedStudents,
  followUpStudents,
  loading,
  error,
}: WeeklyOpsProps) {
  return (
    <AnalyticsShell loading={loading} error={error}>
      <div style={{ display: 'grid', gap: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {weeklyChanges.map(c => (
            <ChangeCard key={c.metric} {...c} />
          ))}
        </div>

        <MovementTable
          title="Newly At Risk"
          description="Students whose engagement score crossed into the warning band this week."
          rows={newlyAtRisk}
          icon={AlertCircle}
          color={BRAND.red}
          bg={BRAND.redLight}
          variant="risk"
        />

        <MovementTable
          title="Improved Students"
          description="Students whose engagement score improved meaningfully this week."
          rows={improvedStudents}
          icon={Sparkles}
          color={BRAND.greenDark}
          bg={BRAND.greenLight}
          variant="improved"
        />

        <MovementTable
          title="Students Requiring Follow Up"
          description="Mentor outreach recommended before next week."
          rows={followUpStudents}
          icon={PhoneCall}
          color={BRAND.yellowDark}
          bg={BRAND.yellowLight}
          variant="followup"
        />
      </div>
    </AnalyticsShell>
  );
}
