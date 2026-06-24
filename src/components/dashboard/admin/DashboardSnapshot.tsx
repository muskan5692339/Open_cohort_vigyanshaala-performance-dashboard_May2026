import { useRef } from 'react';
import { Printer } from 'lucide-react';
import type { DynamicAnalyticsResult } from '../../../services/dynamicAnalytics';
import { filtersSummaryLabel } from '../../../services/globalFilters';
import type { GlobalFilterSelections } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';

interface DashboardSnapshotProps {
  analytics: DynamicAnalyticsResult;
  appliedFilters: GlobalFilterSelections;
  fileName?: string;
}

export default function DashboardSnapshot({ analytics, appliedFilters, fileName }: DashboardSnapshotProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const topPerformers = analytics.roleAware.assessment?.topPerformers.slice(0, 5) ?? analytics.roleAware.attendance?.leaderboard.slice(0, 5) ?? [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} className="no-print">
        <button type="button" onClick={handlePrint} style={actionBtn}>
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      <div
        ref={printRef}
        id="dashboard-snapshot"
        style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 24 }}
      >
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #dashboard-snapshot, #dashboard-snapshot * { visibility: visible; }
            #dashboard-snapshot { position: absolute; left: 0; top: 0; width: 100%; border: none; }
            .no-print { display: none !important; }
          }
        `}</style>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>VigyanShaala Dashboard Snapshot</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 6 }}>
            Generated {new Date().toLocaleString()}
            {fileName && <> · Source: {fileName}</>}
          </div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>
            Filters: {filtersSummaryLabel(appliedFilters) || 'None'}
          </div>
        </div>

        <Section title="Overview">
          <Grid>
            <Stat label="Students" value={analytics.summary.totalRows} />
            <Stat label="Mapped Columns" value={analytics.summary.mappedColumns} />
            <Stat label="Percentage Metrics" value={analytics.percentageMetrics.length} />
            <Stat label="Status Metrics" value={analytics.statusMetrics.length} />
          </Grid>
        </Section>

        <Section title="Risk Summary">
          <Grid>
            {Object.entries(analytics.riskMetrics.counts).map(([k, v]) => (
              <Stat key={k} label={k} value={v} />
            ))}
          </Grid>
        </Section>

        <Section title="Completion Rates">
          {analytics.statusMetrics.length === 0 ? (
            <p style={{ fontSize: 13, color: BRAND.textLight }}>No status metrics mapped.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Status Field</th>
                  <th style={th}>Completion %</th>
                </tr>
              </thead>
              <tbody>
                {analytics.statusMetrics.map(m => (
                  <tr key={m.column}>
                    <td style={td}>{m.column}</td>
                    <td style={td}>{m.completionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Top Performers">
          {topPerformers.length === 0 ? (
            <p style={{ fontSize: 13, color: BRAND.textLight }}>No leader data available.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr><th style={th}>Student</th><th style={th}>Score</th></tr>
              </thead>
              <tbody>
                {topPerformers.map((p, i) => (
                  <tr key={`${p.studentLabel}-${i}`}>
                    <td style={td}>{p.studentLabel}</td>
                    <td style={td}>{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Key Performance Metrics">
          {analytics.percentageMetrics.slice(0, 6).map(m => (
            <div key={m.column} style={{ marginBottom: 10, fontSize: 13 }}>
              <strong>{m.column}</strong>: avg {m.average}% · median {m.median}% · range {m.min}–{m.max}%
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.navy, marginBottom: 8, borderBottom: `2px solid ${BRAND.yellow}`, paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>{value}</div>
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  border: 'none',
  borderRadius: 8,
  background: BRAND.navy,
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${BRAND.border}`, fontSize: 11, color: BRAND.textLight };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${BRAND.borderLight}`, color: BRAND.text };
