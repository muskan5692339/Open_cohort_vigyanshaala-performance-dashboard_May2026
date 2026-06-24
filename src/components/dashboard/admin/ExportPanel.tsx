import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { appendAuditLog } from '../../../services/auditLogStore';
import { useSyncContext } from '../../../hooks/useSyncContext';
import { recordExport } from '../../../services/dashboardHealthMonitor';
import { recordTelemetry } from '../../../services/telemetryService';
import type { DynamicAnalyticsResult } from '../../../services/dynamicAnalytics';
import type { ExportMeta } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';
import {
  buildExportMeta,
  exportRiskReportCsv,
  exportRiskReportXlsx,
  exportStudentTableCsv,
  exportStudentTableXlsx,
  exportSummaryReportCsv,
  exportSummaryReportXlsx,
} from '../../../services/exportService';

interface ExportPanelProps {
  rows: Record<string, string>[];
  columns: string[];
  analytics: DynamicAnalyticsResult | null;
  appliedFilters: ExportMeta['appliedFilters'];
  fileName?: string;
}

type ExportKind = 'students' | 'risk' | 'summary';
type ExportFormat = 'csv' | 'xlsx';

export default function ExportPanel({ rows, columns, analytics, appliedFilters, fileName }: ExportPanelProps) {
  const syncCtx = useSyncContext();
  const [busy, setBusy] = useState(false);

  const runExport = async (kind: ExportKind, format: ExportFormat) => {
    if (!analytics && kind !== 'students') return;
    setBusy(true);
    const t0 = performance.now();
    try {
      const meta = buildExportMeta(rows.length, appliedFilters, fileName);
      if (kind === 'students') {
        if (format === 'csv') await exportStudentTableCsv(rows, columns, meta);
        else await exportStudentTableXlsx(rows, columns, meta);
      } else if (kind === 'risk') {
        const students = analytics!.riskMetrics.students;
        if (format === 'csv') await exportRiskReportCsv(students, meta);
        else await exportRiskReportXlsx(students, meta);
      } else {
        if (format === 'csv') await exportSummaryReportCsv(analytics!, meta);
        else await exportSummaryReportXlsx(analytics!, meta);
      }
      recordExport(true);
      appendAuditLog('export', `Exported ${kind} as ${format.toUpperCase()}`, { records: rows.length, kind, format }, syncCtx);
      recordTelemetry('export_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: true,
        metadata: { kind, format, records: rows.length },
      });
    } finally {
      setBusy(false);
    }
  };

  const runExportSafe = async (kind: ExportKind, format: ExportFormat) => {
    const t0 = performance.now();
    try {
      await runExport(kind, format);
    } catch {
      recordExport(false);
      appendAuditLog('export', `Export failed: ${kind}`, { kind, format }, syncCtx);
      recordTelemetry('export_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: false,
        metadata: { kind, format },
      });
    }
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        <Download size={16} /> Exports
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <ExportCard
          title="Filtered Student Table"
          description={`${rows.length} records · CSV or Excel`}
          disabled={busy || !rows.length}
          onCsv={() => runExportSafe('students', 'csv')}
          onXlsx={() => runExportSafe('students', 'xlsx')}
        />
        <ExportCard
          title="Risk Report"
          description="All students with risk scores"
          disabled={busy || !analytics}
          onCsv={() => runExportSafe('risk', 'csv')}
          onXlsx={() => runExportSafe('risk', 'xlsx')}
        />
        <ExportCard
          title="Summary Dashboard"
          description="KPIs, performance & risk summary"
          disabled={busy || !analytics}
          onCsv={() => runExportSafe('summary', 'csv')}
          onXlsx={() => runExportSafe('summary', 'xlsx')}
        />
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  disabled,
  onCsv,
  onXlsx,
}: {
  title: string;
  description: string;
  disabled: boolean;
  onCsv: () => void;
  onXlsx: () => void;
}) {
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12, background: BRAND.bg }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.navy }}>{title}</div>
      <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 4, marginBottom: 10 }}>{description}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={disabled} onClick={onCsv} style={exportBtn(disabled)}>
          CSV
        </button>
        <button type="button" disabled={disabled} onClick={onXlsx} style={exportBtn(disabled)}>
          <FileSpreadsheet size={12} /> Excel
        </button>
      </div>
    </div>
  );
}

function exportBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    border: `1px solid ${BRAND.border}`,
    borderRadius: 6,
    background: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
  };
}
