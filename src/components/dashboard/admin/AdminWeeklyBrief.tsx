import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnMapping } from '../../../types/dynamicSchema';
import type { UploadSnapshot, WeeklyInterventionStats } from '../../../types/intelligenceTypes';
import { BRAND } from '../../../types/adminTypes';
import { listUploadSnapshots } from '../../../services/uploadSnapshotStore';
import {
  computeWeeklyAssignmentTotals,
  findInterventionColumn,
  formatUploadLabel,
} from '../../../services/weeklyAdminMetrics';

interface Props {
  rows: Record<string, string>[];
  headers: string[];
  mapping: ColumnMapping | undefined;
  fileName: string | null;
  publishedAt: string | null;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function AdminWeeklyBrief({ rows, headers, mapping, fileName, publishedAt }: Props) {
  const snapshots = useMemo(() => [...listUploadSnapshots()].reverse(), [rows.length, fileName]);
  const [interventionFilter, setInterventionFilter] = useState<string>('all');

  const currentWeek = useMemo(
    () => computeWeeklyAssignmentTotals(rows, headers, mapping),
    [rows, headers, mapping],
  );

  const interventionCol = findInterventionColumn(headers, mapping);
  const groups = currentWeek.interventionBreakdown;

  const filteredGroup = interventionFilter === 'all'
    ? null
    : groups.find(g => g.group === interventionFilter);

  const chartData = useMemo(() => {
    return snapshots.map((snap: UploadSnapshot, idx: number) => {
      const prev = idx > 0 ? snapshots[idx - 1] : null;
      const m = snap.metrics;
      const breakdown = interventionFilter === 'all'
        ? null
        : m.interventionBreakdown?.find(b => b.group === interventionFilter);

      const submitted = breakdown?.assignmentsSubmitted ?? m.assignmentsSubmitted ?? 0;
      const reviewed = breakdown?.assignmentsReviewed ?? m.assignmentsReviewed ?? 0;
      const accepted = breakdown?.assignmentsAccepted ?? m.assignmentsAccepted ?? 0;

      const prevM = prev?.metrics;
      const prevBreakdown = interventionFilter === 'all'
        ? null
        : prevM?.interventionBreakdown?.find(b => b.group === interventionFilter);
      const prevSubmitted = prevBreakdown?.assignmentsSubmitted ?? prevM?.assignmentsSubmitted ?? null;

      return {
        label: new Date(snap.uploadedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        fullLabel: formatUploadLabel(snap.uploadedAt, snap.fileName),
        submitted,
        reviewed,
        accepted,
        students: breakdown?.studentCount ?? m.studentCount,
        deltaSubmitted: prevSubmitted != null ? submitted - prevSubmitted : null,
      };
    });
  }, [snapshots, interventionFilter]);

  const displaySubmitted = filteredGroup?.assignmentsSubmitted ?? currentWeek.assignmentsSubmitted;
  const displayReviewed = filteredGroup?.assignmentsReviewed ?? currentWeek.assignmentsReviewed;
  const displayAccepted = filteredGroup?.assignmentsAccepted ?? currentWeek.assignmentsAccepted;
  const displayPending = filteredGroup?.assignmentsPending ?? currentWeek.assignmentsPending;
  const displayStudents = filteredGroup?.studentCount ?? rows.length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Your weekly brief</strong> — one screen, no noise. Upload a new Excel file each week; this page tracks what changed.
        {publishedAt && (
          <span style={{ color: BRAND.textLight }}> · Last upload: {formatUploadLabel(publishedAt, fileName ?? undefined)}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>
          Intervention group
          <select
            value={interventionFilter}
            onChange={e => setInterventionFilter(e.target.value)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value="all">All groups</option>
            {groups.map((g: WeeklyInterventionStats) => (
              <option key={g.group} value={g.group}>{g.group} ({g.studentCount})</option>
            ))}
          </select>
        </label>
        {interventionCol && (
          <span style={{ fontSize: 11, color: BRAND.textLight }}>From column: {interventionCol}</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <StatCard label="Students" value={displayStudents} />
        <StatCard label="Submitted" value={displaySubmitted} hint="Assignments turned in" />
        <StatCard label="Reviewed" value={displayReviewed} hint="Accepted or rejected" />
        <StatCard label="Accepted" value={displayAccepted} hint="Approved by facilitators" />
        <StatCard label="Pending" value={displayPending} hint="No submission yet" />
      </div>

      {chartData.length > 1 ? (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Weekly trend (each upload)</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
            Line graph shows assignment counts after every sheet upload{interventionFilter !== 'all' ? ` — ${interventionFilter} only` : ''}.
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                <XAxis dataKey="label" fontSize={11} stroke={BRAND.textLight} />
                <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
                />
                <Legend />
                <Line type="monotone" dataKey="submitted" name="Submitted" stroke={BRAND.blue} strokeWidth={2.5} dot />
                <Line type="monotone" dataKey="reviewed" name="Reviewed" stroke={BRAND.yellowDark} strokeWidth={2.5} dot />
                <Line type="monotone" dataKey="accepted" name="Accepted" stroke={BRAND.green} strokeWidth={2.5} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: 12, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          Upload the workbook at least twice to see weekly line trends. Your first snapshot is saved.
        </div>
      )}

      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>This upload — by intervention group</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
              <th style={{ padding: '8px 6px' }}>Group</th>
              <th style={{ padding: '8px 6px' }}>Students</th>
              <th style={{ padding: '8px 6px' }}>Submitted</th>
              <th style={{ padding: '8px 6px' }}>Reviewed</th>
              <th style={{ padding: '8px 6px' }}>Accepted</th>
              <th style={{ padding: '8px 6px' }}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g: WeeklyInterventionStats) => (
              <tr key={g.group} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{g.group}</td>
                <td style={{ padding: '8px 6px' }}>{g.studentCount}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsSubmitted}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsReviewed}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsAccepted}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsPending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
