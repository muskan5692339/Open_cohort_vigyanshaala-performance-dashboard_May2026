import { useEffect, useMemo, useRef } from 'react';
import type { ColumnMapping } from '../types/dynamicSchema';
import type { DataQualityReport } from '../types/opsTypes';
import type { ProgramIntelligenceBundle } from '../types/intelligenceTypes';
import type { DynamicAnalyticsResult } from '../services/dynamicAnalytics';
import {
  buildSnapshotMetrics,
  computeHealthScore,
  generateProgramIntelligence,
} from '../services/programIntelligence';
import { computeWeeklyAssignmentTotals } from '../services/weeklyAdminMetrics';
import {
  getPreviousSnapshot,
  listUploadSnapshots,
  saveUploadSnapshot,
} from '../services/uploadSnapshotStore';
import { appendRecommendationHistory } from '../services/recommendationHistoryStore';

export function useProgramIntelligence(input: {
  analytics: DynamicAnalyticsResult | null;
  rows: Record<string, string>[];
  mapping: ColumnMapping | undefined;
  dataQuality: DataQualityReport;
  fileName?: string | null;
}) {
  const { analytics, rows, mapping, dataQuality, fileName } = input;
  const savedRef = useRef<string | null>(null);

  const previousSnapshot = useMemo(() => {
    const snaps = listUploadSnapshots();
    return snaps.length > 1 ? snaps[1] : getPreviousSnapshot(snaps[0]?.id);
  }, [analytics?.summary.generatedAt]);

  const intelligence = useMemo((): ProgramIntelligenceBundle | null => {
    if (!analytics || !mapping || !rows.length) return null;
    return generateProgramIntelligence({
      analytics,
      rows,
      mapping,
      dataQuality,
      previousSnapshot: previousSnapshot ?? null,
    });
  }, [analytics, rows, mapping, dataQuality, previousSnapshot]);

  useEffect(() => {
    if (!analytics || !fileName) return;
    const key = `${fileName}-${analytics.summary.totalRows}-${analytics.summary.generatedAt}`;
    if (savedRef.current === key) return;
    savedRef.current = key;

    const health = computeHealthScore(analytics, dataQuality);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const weekly = computeWeeklyAssignmentTotals(rows, headers, mapping);
    const metrics = {
      ...buildSnapshotMetrics(analytics, health),
      assignmentsSubmitted: weekly.assignmentsSubmitted,
      assignmentsReviewed: weekly.assignmentsReviewed,
      assignmentsAccepted: weekly.assignmentsAccepted,
      assignmentsPending: weekly.assignmentsPending,
      interventionBreakdown: weekly.interventionBreakdown,
    };
    saveUploadSnapshot({ fileName, metrics });

    const bundle = generateProgramIntelligence({
      analytics,
      rows,
      mapping: mapping!,
      dataQuality,
      previousSnapshot: getPreviousSnapshot() ?? null,
    });
    if (bundle.interventions.length) {
      appendRecommendationHistory(bundle.interventions);
    }
  }, [analytics, fileName, dataQuality, rows, mapping]);

  return { intelligence, snapshots: listUploadSnapshots() };
}
