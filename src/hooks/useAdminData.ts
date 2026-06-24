import { useMemo } from 'react';
import { useUploadedExcel } from '../context/UploadedExcelContext';
import { buildAnalyticsBundle } from '../services/studentMetrics';
import {
  generateDynamicAnalytics,
  type DynamicAnalyticsResult,
} from '../services/dynamicAnalytics';
import type {
  AnalyticsBundle,
  CohortSummary,
  KPISummary,
  MetricsDataset,
} from '../services/loadMetricsDataset';

export type { KPISummary, CohortSummary, AnalyticsBundle };

export interface LastImportInfo {
  runAt: string;
  recordsUpdated: number;
  status: string;
}

export interface AdminData {
  students: MetricsDataset['students'];
  kpi: KPISummary;
  cohortMetrics: CohortSummary[];
  analytics: AnalyticsBundle;
  filterOptions: MetricsDataset['filterOptions'];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  lastSync: string;
  lastImport: LastImportInfo | null;
  dataSource: 'excel' | 'none';
  fileName: string | null;
  dynamicAnalytics: DynamicAnalyticsResult | null;
}

const EMPTY_KPI: KPISummary = {
  totalStudents: 0,
  activeStudents: 0,
  atRiskStudents: 0,
  avgAttendance: 0,
  avgAssignment: 0,
  avgQuiz: 0,
  avgEngagement: 0,
  topPerformers: 0,
};

const EMPTY_ANALYTICS = buildAnalyticsBundle([], {
  sessions: [],
  attendance: [],
  submissions: [],
  quizResults: [],
  studentCohortUuid: new Map(),
  quizCountByCohort: new Map(),
});

const EMPTY: Omit<AdminData, 'refetch' | 'dataSource' | 'fileName'> = {
  students: [],
  kpi: EMPTY_KPI,
  cohortMetrics: [],
  analytics: EMPTY_ANALYTICS,
  filterOptions: { cohorts: [], colleges: [], states: [], programs: [] },
  loading: false,
  error: null,
  lastSync: '',
  lastImport: null,
  dynamicAnalytics: null,
};

/** Dashboard data from uploaded Excel (in-memory / sessionStorage). No Supabase fetch. */
export function useAdminData(): AdminData {
  const { dataset, payload, meta, loadFromParsed } = useUploadedExcel();

  return useMemo(() => {
    if (!dataset) {
      return {
        ...EMPTY,
        refetch: () => {},
        dataSource: 'none' as const,
        fileName: null,
      };
    }

    const lastSync = meta?.loadedAt
      ? new Date(meta.loadedAt).toISOString().replace('T', ' ').slice(0, 19)
      : '';

    const dynamicAnalytics =
      payload?.rawRows?.length && payload?.mapping
        ? generateDynamicAnalytics(payload.rawRows, payload.mapping)
        : null;

    return {
      students: dataset.students,
      kpi: dataset.kpi,
      cohortMetrics: dataset.cohortMetrics,
      analytics: dataset.analytics,
      filterOptions: dataset.filterOptions,
      loading: false,
      error: null,
      refetch: () => {
        const stored = sessionStorage.getItem('vs_uploaded_excel_v2');
        if (!stored) return;
        try {
          const { payload } = JSON.parse(stored) as { payload: Parameters<typeof loadFromParsed>[0] };
          loadFromParsed(payload);
        } catch {
          /* ignore */
        }
      },
      lastSync,
      lastImport: meta
        ? {
            runAt: meta.loadedAt,
            recordsUpdated: meta.studentCount,
            status: 'success',
          }
        : null,
      dataSource: 'excel' as const,
      fileName: meta?.fileName ?? null,
      dynamicAnalytics,
    };
  }, [dataset, payload, meta, loadFromParsed]);
}
