import { lazy, Suspense, useState } from 'react';
import { CloudUpload, FileSpreadsheet, Clock } from 'lucide-react';
import { BRAND } from '../../types/adminTypes';

const ExcelUpload = lazy(() => import('../../components/datasource/ExcelUpload'));
const OneDriveSync = lazy(() => import('../../components/datasource/OneDriveSync'));
const SyncHistory = lazy(() => import('../../components/datasource/SyncHistory'));
const SyncRunsPanel = lazy(() => import('../../components/datasource/SyncRunsPanel'));
const UploadHistoryPanel = lazy(() => import('../../components/dashboard/admin/UploadHistoryPanel'));

type Tab = 'excel' | 'onedrive' | 'history';

interface TabDef {
  id: Tab;
  label: string;
  icon: typeof CloudUpload;
  badge?: string;
}

const TABS: TabDef[] = [
  { id: 'excel',    label: 'Excel Upload',  icon: FileSpreadsheet, badge: 'Recommended' },
  { id: 'onedrive', label: 'OneDrive Sync', icon: CloudUpload },
  { id: 'history',  label: 'Sync History',  icon: Clock },
];

interface Props { onDataImported?: (info: { cohortName: string }) => void; }

function TabFallback() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: BRAND.textLight, fontSize: 14 }}>
      Loading…
    </div>
  );
}

export default function DataSourcePage({ onDataImported }: Props) {
  const [active, setActive] = useState<Tab>('excel');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ padding: '24px 40px 0', borderBottom: `1px solid ${BRAND.border}`, background: '#fff' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy, margin: '0 0 4px' }}>Data Sources</h1>
        <p style={{ fontSize: 13, color: BRAND.textLight, margin: '0 0 20px' }}>
          Upload an Excel workbook to visualize student, attendance, assignment, and quiz data on the dashboard.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${BRAND.navy}` : '2px solid transparent',
                  borderRadius: '8px 8px 0 0',
                  background: isActive ? BRAND.bg : 'transparent',
                  color: isActive ? BRAND.navy : BRAND.textLight,
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'color 120ms, background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} />
                {tab.label}
                {tab.badge && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: '#dcfce7', color: '#15803d', letterSpacing: 0.3,
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, background: BRAND.bg, overflowY: 'auto' }}>
        <Suspense fallback={<TabFallback />}>
          {active === 'excel'    && <ExcelUpload    onDataImported={onDataImported} />}
          {active === 'onedrive' && <OneDriveSync   onDataImported={onDataImported} />}
          {active === 'history'  && (
            <div style={{ padding: 20, display: 'grid', gap: 20 }}>
              <SyncRunsPanel />
              <UploadHistoryPanel />
              <SyncHistory />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
