import { useEffect, useMemo, useState, Suspense } from 'react';
import Sidebar from '../../components/dashboard/admin/Sidebar';
import TopBar from '../../components/dashboard/admin/TopBar';
import GlobalFilterBar from '../../components/dashboard/admin/GlobalFilterBar';
import DynamicStudentTable from '../../components/dashboard/admin/DynamicStudentTable';
import DataQualityPanel from '../../components/dashboard/admin/DataQualityPanel';
import type { SidebarSection } from '../../types/adminTypes';
import { BRAND } from '../../types/adminTypes';
import { useAdminData } from '../../hooks/useAdminData';
import { useOperationalDashboard } from '../../hooks/useOperationalDashboard';
import { useProgramIntelligence } from '../../hooks/useProgramIntelligence';
import { useUploadedExcel } from '../../context/UploadedExcelContext';
import { AdminSignInProvider } from '../../context/AdminSignInContext';
import { activeFilterChips } from '../../services/globalFilters';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const DataSourcePage = lazyWithRetry(() => import('./DataSourcePage'));
const HelpCenterPage = lazyWithRetry(() => import('./HelpCenterPage'));
const TestingQualityReportPage = lazyWithRetry(() => import('./TestingQualityReportPage'));
const DashboardHealthPanel = lazyWithRetry(() => import('../../components/dashboard/admin/DashboardHealthPanel'));
const AuditLogPanel = lazyWithRetry(() => import('../../components/dashboard/admin/AuditLogPanel'));
const TelemetryPanel = lazyWithRetry(() => import('../../components/system/TelemetryPanel'));
const ProgramIntelligenceHub = lazyWithRetry(() => import('../../components/dashboard/admin/intelligence/ProgramIntelligenceHub'));
const SavedFilterViewsPanel = lazyWithRetry(() => import('../../components/dashboard/admin/SavedFilterViewsPanel'));
const ExportPanel = lazyWithRetry(() => import('../../components/dashboard/admin/ExportPanel'));
const RiskActionCenter = lazyWithRetry(() => import('../../components/dashboard/admin/RiskActionCenter'));
const DashboardSnapshot = lazyWithRetry(() => import('../../components/dashboard/admin/DashboardSnapshot'));
const PercentageDistributionChart = lazyWithRetry(() =>
  import('../../components/dashboard/admin/AdminDashboardCharts').then(m => ({ default: m.PercentageDistributionChart })),
);
const NumericDistributionChart = lazyWithRetry(() =>
  import('../../components/dashboard/admin/AdminDashboardCharts').then(m => ({ default: m.NumericDistributionChart })),
);
const StatusBreakdownChart = lazyWithRetry(() =>
  import('../../components/dashboard/admin/AdminDashboardCharts').then(m => ({ default: m.StatusBreakdownChart })),
);
const CategoryBarChart = lazyWithRetry(() =>
  import('../../components/dashboard/admin/AdminDashboardCharts').then(m => ({ default: m.CategoryBarChart })),
);
const RiskCountChart = lazyWithRetry(() =>
  import('../../components/dashboard/admin/AdminDashboardCharts').then(m => ({ default: m.RiskCountChart })),
);

const ChartFallback = () => (
  <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.textLight, fontSize: 12 }}>
    Loading chart…
  </div>
);

interface AdminDashboardPageProps {
  onBackToStudent: () => void;
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}


function DataStatusBanner({
  lastImport,
  activeFilterCount,
  studentCount,
  fileName,
}: {
  lastImport: { runAt: string; recordsUpdated: number; status: string } | null;
  activeFilterCount: number;
  studentCount: number;
  fileName: string | null;
}) {
  const lastRun = lastImport?.runAt
    ? new Date(lastImport.runAt).toISOString().replace('T', ' ').slice(0, 19)
    : null;
  const filterLabel = activeFilterCount === 0 ? 'No filters' : `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active`;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#f0f4ff',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        fontSize: 13,
        color: BRAND.text,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        {fileName && (
          <>
            <strong>Excel:</strong> {fileName}
            <span style={{ color: BRAND.textLight }}> · </span>
          </>
        )}
        {lastRun ? (
          <>
            <strong>Loaded:</strong> {lastRun}
            <span style={{ color: BRAND.textLight }}>
              {' '}
              · {lastImport?.recordsUpdated ?? 0} students
            </span>
          </>
        ) : (
          <span style={{ color: BRAND.textLight }}>Showing uploaded workbook data.</span>
        )}
        <span style={{ marginLeft: 8, color: BRAND.textLight }}>
          · {filterLabel} · {studentCount} students shown
        </span>
      </div>
    </div>
  );
}

function EmptyDataState({ onGoToDataSources }: { onGoToDataSources: () => void }) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: 'center',
        background: BRAND.card,
        border: `1px dashed ${BRAND.border}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.navy, marginBottom: 8 }}>No student data yet</div>
      <p style={{ fontSize: 14, color: BRAND.textLight, margin: '0 0 16px', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
        Upload an Excel workbook in Data Sources, then click <strong>View on Dashboard</strong> to populate KPIs and charts.
      </p>
      <button
        type="button"
        onClick={onGoToDataSources}
        style={{
          padding: '10px 20px',
          borderRadius: 8,
          border: 'none',
          background: BRAND.navy,
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Go to Data Sources
      </button>
    </div>
  );
}

function LoadErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{ padding: 20, background: BRAND.redLight, borderRadius: 10, color: BRAND.red, fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Failed to load dashboard data</div>
      <p style={{ margin: '0 0 12px' }}>{error}</p>
      <p style={{ margin: '0 0 12px', color: BRAND.text, fontSize: 12 }}>
        Check <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>. See{' '}
        <code>ENV_SETUP.md</code> for details.
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: 'none',
          background: BRAND.red,
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Retry
      </button>
    </div>
  );
}

export default function AdminDashboardPage({ onBackToStudent }: AdminDashboardPageProps) {
  const [section, setSection] = useState<SidebarSection>('dashboard');
  const [syncing, setSyncing] = useState(false);
  const { payload } = useUploadedExcel();

  const {
    loading,
    error,
    refetch,
    lastSync: dataLastSync,
    lastImport,
    fileName,
    dynamicAnalytics,
  } = useAdminData();
  const [lastSync, setLastSync] = useState('');
  useEffect(() => { if (dataLastSync) setLastSync(dataLastSync); }, [dataLastSync]);

  const mapping = payload?.mapping;
  const rawRows = payload?.rawRows ?? [];

  const {
    filterState,
    setFilterState,
    filterColumns,
    filteredRows,
    deferredFilteredRows,
    activeAnalytics,
    dataQuality,
    tableColumns,
  } = useOperationalDashboard({
    rawRows,
    mapping,
    headers: payload?.headers,
    discoveredColumns: payload?.discoveredColumns,
    baseAnalytics: dynamicAnalytics,
  });

  const activeFilterCount = activeFilterChips(filterState).length;

  const { intelligence } = useProgramIntelligence({
    analytics: activeAnalytics,
    rows: filteredRows,
    mapping,
    dataQuality,
    fileName,
  });

  const riskByKey = useMemo(() => {
    const map = new Map<string, NonNullable<typeof activeAnalytics>['riskMetrics']['students'][0]>();
    for (const s of activeAnalytics?.riskMetrics.students ?? []) {
      map.set(s.studentKey, s);
      map.set(s.studentKey.toLowerCase(), s);
    }
    return map;
  }, [activeAnalytics]);

  const handleDataImported = (info: { cohortName: string }) => {
    setLastSync(new Date().toISOString().replace('T', ' ').slice(0, 19));
    if (info.cohortName) setSection('dashboard');
  };

  const triggerSync = () => {
    setSyncing(true);
    refetch();
    setLastSync(new Date().toISOString().replace('T', ' ').slice(0, 19));
    setTimeout(() => setSyncing(false), 500);
  };

  const showDataBanner = section !== 'data-source' && !loading && !error && (activeAnalytics?.summary.totalRows ?? 0) > 0;
  const showEmptyState = !loading && !error && (activeAnalytics?.summary.totalRows ?? 0) === 0 && section !== 'data-source';

  const riskRows = activeAnalytics?.riskMetrics.students ?? [];
  const atRiskRows = riskRows.filter(r => r.category === 'At Risk' || r.category === 'Critical Risk');
  const riskCount = activeAnalytics?.riskMetrics.counts ?? null;

  const summaryCards = useMemo(() => {
    if (!activeAnalytics) return [];
    return [
      { label: 'Total Students', value: activeAnalytics.summary.totalRows },
      { label: 'Total Columns', value: activeAnalytics.summary.mappedColumns },
      { label: 'Percentage Metrics Count', value: activeAnalytics.percentageMetrics.length },
      { label: 'Numeric Metrics Count', value: activeAnalytics.numericMetrics.length },
      { label: 'Status Metrics Count', value: activeAnalytics.statusMetrics.length },
      { label: 'Risk Categories Count', value: Object.values(activeAnalytics.riskMetrics.counts).filter(v => v > 0).length },
    ];
  }, [activeAnalytics]);

  const renderOpsToolbar = () => {
    if (!mapping) return null;
    return (
      <>
        <GlobalFilterBar
          filterColumns={filterColumns}
          filterState={filterState}
          mapping={mapping}
          onChange={setFilterState}
        />
        <Suspense fallback={null}>
          <SavedFilterViewsPanel currentFilters={filterState} onLoad={setFilterState} />
          <ExportPanel
            rows={filteredRows}
            columns={tableColumns}
            analytics={activeAnalytics}
            appliedFilters={filterState.selections}
            fileName={fileName ?? undefined}
          />
        </Suspense>
      </>
    );
  };

  const renderAnalyticsSections = () => (
    <div style={{ display: 'grid', gap: 20 }}>
      <SectionHeading title="Executive Summary" hint="Generated from analytics.summary and mapped schema." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase' }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.navy, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {activeAnalytics?.percentageMetrics.length ? (
        <>
          <SectionHeading title="Performance Metrics" hint="All mapped percentage columns." />
          <div style={{ display: 'grid', gap: 16 }}>
            {activeAnalytics.percentageMetrics.map(metric => (
              <div key={metric.column} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 10 }}>
                  {metric.column} <span style={{ color: BRAND.textLight, fontSize: 12 }}>({metric.role})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <MetricCell label="Average" value={`${metric.average}%`} />
                  <MetricCell label="Median" value={`${metric.median}%`} />
                  <MetricCell label="Min" value={`${metric.min}%`} />
                  <MetricCell label="Max" value={`${metric.max}%`} />
                </div>
                <div style={{ height: 220 }}>
                  <Suspense fallback={<ChartFallback />}>
                    <PercentageDistributionChart data={metric.distribution} />
                  </Suspense>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
                  <RankTable title="Top 10" rows={metric.top10} valueSuffix="%" />
                  <RankTable title="Bottom 10" rows={metric.bottom10} valueSuffix="%" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {activeAnalytics?.numericMetrics.length ? (
        <>
          <SectionHeading title="Numeric Metrics" hint="All mapped numeric columns." />
          <div style={{ display: 'grid', gap: 16 }}>
            {activeAnalytics.numericMetrics.map(metric => (
              <div key={metric.column} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 10 }}>
                  {metric.column} <span style={{ color: BRAND.textLight, fontSize: 12 }}>({metric.role})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <MetricCell label="Average" value={String(metric.average)} />
                  <MetricCell label="Median" value={String(metric.median)} />
                  <MetricCell label="Min" value={String(metric.min)} />
                  <MetricCell label="Max" value={String(metric.max)} />
                </div>
                <div style={{ height: 220 }}>
                  <Suspense fallback={<ChartFallback />}>
                    <NumericDistributionChart data={metric.distribution} />
                  </Suspense>
                </div>
                <div style={{ marginTop: 12 }}>
                  <RankTable title="Ranking" rows={metric.ranking.slice(0, 20)} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {activeAnalytics?.statusMetrics.length ? (
        <>
          <SectionHeading title="Status Analytics" hint="All mapped status fields with completion rates." />
          <div style={{ display: 'grid', gap: 16 }}>
            {activeAnalytics.statusMetrics.map(metric => (
              <div key={metric.column} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, color: BRAND.navy }}>
                    {metric.column} <span style={{ color: BRAND.textLight, fontSize: 12 }}>({metric.role})</span>
                  </div>
                  <div style={{ fontSize: 13, color: BRAND.textLight }}>Completion: {metric.completionRate}%</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                  <div style={{ height: 220 }}>
                    <Suspense fallback={<ChartFallback />}>
                      <StatusBreakdownChart data={metric.breakdown} />
                    </Suspense>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr><th style={th}>Status</th><th style={th}>Count</th><th style={th}>%</th></tr></thead>
                    <tbody>
                      {metric.breakdown.map(b => (
                        <tr key={b.status}>
                          <td style={td}>{b.status}</td><td style={td}>{b.count}</td><td style={td}>{b.percentage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {activeAnalytics?.categoryMetrics.length ? (
        <>
          <SectionHeading title="Category Analytics" hint="Breakdowns and percentages for mapped categories." />
          <div style={{ display: 'grid', gap: 16 }}>
            {activeAnalytics.categoryMetrics.map(metric => (
              <div key={metric.column} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 10 }}>
                  {metric.column} <span style={{ color: BRAND.textLight, fontSize: 12 }}>({metric.role})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ height: 220 }}>
                    <Suspense fallback={<ChartFallback />}>
                      <CategoryBarChart data={metric.values.slice(0, 12)} />
                    </Suspense>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr><th style={th}>Value</th><th style={th}>Count</th><th style={th}>%</th></tr></thead>
                    <tbody>
                      {metric.values.map(v => (
                        <tr key={v.value}>
                          <td style={td}>{v.value}</td>
                          <td style={td}>{v.count}</td>
                          <td style={td}>{v.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {riskCount ? (
        <>
          <SectionHeading title="Risk Intelligence" hint="Generated by role-aware risk engine." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {Object.entries(riskCount).map(([k, v]) => (
              <div key={k} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: BRAND.textLight }}>{k}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.navy }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ height: 240 }}>
              <Suspense fallback={<ChartFallback />}>
                <RiskCountChart data={Object.entries(riskCount).map(([name, value]) => ({ name, value }))} />
              </Suspense>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><th style={th}>Student</th><th style={th}>Score</th><th style={th}>Category</th><th style={th}>Reasons</th></tr></thead>
                <tbody>
                  {atRiskRows.slice(0, 20).map(r => (
                    <tr key={r.studentKey}>
                      <td style={td}>{r.studentLabel}</td>
                      <td style={td}>{r.score}</td>
                      <td style={td}>{r.category}</td>
                      <td style={td}>{r.reasons.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {(activeAnalytics?.roleAware.attendance || activeAnalytics?.roleAware.assessment || activeAnalytics?.roleAware.participation) && (
        <>
          <SectionHeading title="Role-Aware Insights" hint="Leaders derived from mapped business roles." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {activeAnalytics?.roleAware.attendance && (
              <LeaderboardCard title="Attendance Leaders" rows={activeAnalytics.roleAware.attendance.leaderboard} valueSuffix="%" />
            )}
            {activeAnalytics?.roleAware.assessment && (
              <LeaderboardCard title="Assessment Leaders" rows={activeAnalytics.roleAware.assessment.topPerformers} valueSuffix="%" />
            )}
            {activeAnalytics?.roleAware.participation && (
              <LeaderboardCard
                title="Participation Leaders"
                rows={(activeAnalytics.numericMetrics.find(m => m.role === 'participation')?.ranking ?? []).slice(0, 10)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderContent = () => {
    if (loading && section !== 'data-source') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: BRAND.textLight, fontSize: 14 }}>
          Loading dashboard data…
        </div>
      );
    }
    if (error && section !== 'data-source') {
      return <LoadErrorState error={error} onRetry={refetch} />;
    }
    if (showEmptyState) {
      return <EmptyDataState onGoToDataSources={() => setSection('data-source')} />;
    }

    switch (section) {
      case 'dashboard':
        return (
          <>
            {renderOpsToolbar()}
            {intelligence && <ProgramIntelligenceHub intelligence={intelligence} mode="dashboard" />}
            {renderAnalyticsSections()}
          </>
        );
      case 'cohort-overview':
      case 'cohort-comparison':
        return (
          <>
            {renderOpsToolbar()}
            {intelligence ? (
              <ProgramIntelligenceHub intelligence={intelligence} mode="cohort-comparison" />
            ) : (
              renderAnalyticsSections()
            )}
          </>
        );
      case 'attendance':
      case 'assignments':
      case 'quizzes':
        return (
          <>
            {renderOpsToolbar()}
            {renderAnalyticsSections()}
          </>
        );
      case 'students':
        return (
          <>
            {renderOpsToolbar()}
            <SectionHeading title="Master Student Table" hint="Search, sort, filter, and export dynamically mapped columns." />
            <DynamicStudentTable
              rows={deferredFilteredRows}
              allColumns={tableColumns}
              riskByKey={riskByKey}
              appliedFilters={filterState.selections}
              fileName={fileName ?? undefined}
            />
          </>
        );
      case 'risk':
        return (
          <>
            {renderOpsToolbar()}
            <Suspense fallback={null}>
              <RiskActionCenter riskStudents={activeAnalytics?.riskMetrics.students ?? []} />
            </Suspense>
            {renderAnalyticsSections()}
          </>
        );
      case 'weekly-ops':
        return (
          <>
            {renderOpsToolbar()}
            {intelligence && <ProgramIntelligenceHub intelligence={intelligence} mode="weekly-ops" />}
            <SectionHeading title="Weekly Operations" hint="Data quality checks, snapshots, and exports." />
            <DataQualityPanel report={dataQuality} totalRows={rawRows.length} />
            {activeAnalytics && (
              <Suspense fallback={null}>
                <DashboardSnapshot
                  analytics={activeAnalytics}
                  appliedFilters={filterState.selections}
                  fileName={fileName ?? undefined}
                />
              </Suspense>
            )}
          </>
        );
      case 'data-source':
        return <DataSourcePage onDataImported={handleDataImported} />;
      case 'help-center':
        return <HelpCenterPage />;
      case 'system-health':
        return (
          <div style={{ display: 'grid', gap: 20 }}>
            <DashboardHealthPanel />
            <TelemetryPanel />
            <AuditLogPanel />
            <TestingQualityReportPage />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AdminSignInProvider>
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.bg,
        display: 'flex',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: BRAND.text,
      }}
    >
      <Sidebar active={section} onChange={setSection} onBackToStudent={onBackToStudent} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar section={section} lastSync={lastSync} onSync={triggerSync} syncing={syncing} />
        <div style={{ padding: 24, flex: 1 }}>
          {showDataBanner && (
            <DataStatusBanner
              lastImport={lastImport}
              activeFilterCount={activeFilterCount}
              studentCount={activeAnalytics?.summary.totalRows ?? 0}
              fileName={fileName}
            />
          )}
          <Suspense fallback={<div style={{ padding: 24, color: BRAND.textLight }}>Loading section…</div>}>
            {renderContent()}
          </Suspense>
        </div>
      </main>
    </div>
    </AdminSignInProvider>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: `1px solid ${BRAND.border}` }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy }}>{value}</div>
    </div>
  );
}

function RankTable({
  title,
  rows,
  valueSuffix = '',
}: {
  title: string;
  rows: { studentLabel: string; value: number }[];
  valueSuffix?: string;
}) {
  return (
    <div style={{ background: '#f8fafc', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 8, fontSize: 13 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.textLight }}>No data</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Student</th>
              <th style={th}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${title}-${r.studentLabel}-${i}`}>
                <td style={td}>{i + 1}</td>
                <td style={td}>{r.studentLabel}</td>
                <td style={td}>{r.value}{valueSuffix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LeaderboardCard({
  title,
  rows,
  valueSuffix = '',
}: {
  title: string;
  rows: { studentLabel: string; value: number }[];
  valueSuffix?: string;
}) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.textLight }}>No data</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={`${r.studentLabel}-${i}`}>
                <td style={td}>{i + 1}. {r.studentLabel}</td>
                <td style={td}>{r.value}{valueSuffix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: `1px solid ${BRAND.border}`, padding: '6px 8px', color: BRAND.textLight, fontSize: 11 };
const td: React.CSSProperties = { borderBottom: `1px solid ${BRAND.border}`, padding: '6px 8px', color: BRAND.text, verticalAlign: 'top' };
