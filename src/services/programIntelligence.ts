import type { ColumnMapping } from '../types/dynamicSchema';
import type { DataQualityReport } from '../types/opsTypes';
import type { DynamicAnalyticsResult } from './dynamicAnalytics';
import type {
  CohortComparisonDimension,
  CollegeReportCard,
  ExecutiveInsight,
  GroupComparisonRow,
  HealthCategory,
  InterventionRecommendation,
  OperationsHealthScore,
  ProgramIntelligenceBundle,
  SmartAlert,
  TopPerformerEntry,
  TopPerformerIntelligence,
  TrendMetric,
  UploadSnapshot,
  UploadSnapshotMetrics,
} from '../types/intelligenceTypes';

type RawRow = Record<string, string>;

const ATTENDANCE_THRESHOLD = 70;
const COMPLETION_KEYWORDS = ['submitted', 'complete', 'completed', 'done', 'certified', 'pass', 'passed', 'yes', 'true'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumeric(raw: string): number | null {
  const v = (raw ?? '').trim().replace(/,/g, '');
  if (!v) return null;
  const ratio = v.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    if (b > 0) return (a / b) * 100;
  }
  const n = Number(v.replace('%', ''));
  if (!Number.isFinite(n)) return null;
  return n <= 1 && n >= 0 ? n * 100 : n;
}

function isCompletionStatus(v: string): boolean {
  const s = v.toLowerCase();
  return COMPLETION_KEYWORDS.some(k => s.includes(k));
}

function colsByRole(mapping: ColumnMapping, role: string, types?: string[]): string[] {
  return Object.entries(mapping)
    .filter(([, m]) => m.mappedRole === role && (!types || types.includes(m.mappedType)))
    .map(([c]) => c);
}

function findDimensionColumns(mapping: ColumnMapping): { column: string; label: string }[] {
  const defs: { label: string; hints: RegExp[] }[] = [
    { label: 'Cohort', hints: [/cohort/i] },
    { label: 'College', hints: [/college/i, /university/i, /institution/i] },
    { label: 'State', hints: [/state/i, /region/i] },
    { label: 'Program', hints: [/program/i, /degree/i, /course/i] },
  ];
  const out: { column: string; label: string }[] = [];
  const used = new Set<string>();

  for (const def of defs) {
    const col = Object.keys(mapping).find(
      c => mapping[c].mappedType === 'category' && def.hints.some(h => h.test(c)) && !used.has(c),
    );
    if (col) {
      used.add(col);
      out.push({ column: col, label: def.label });
    }
  }

  for (const [col, m] of Object.entries(mapping)) {
    if (m.mappedType === 'category' && !used.has(col)) {
      used.add(col);
      out.push({ column: col, label: col });
    }
  }

  return out.slice(0, 6);
}

interface RowMetrics {
  attendance: number;
  assessment: number;
  completion: number;
  certified: number;
  riskScore: number;
  isAtRisk: boolean;
}

function rowMetrics(row: RawRow, mapping: ColumnMapping, riskByKey: Map<string, number>): RowMetrics {
  const attCols = colsByRole(mapping, 'attendance', ['percentage', 'numeric']);
  const assessCols = colsByRole(mapping, 'assessment', ['percentage', 'numeric']);
  const assignCols = [
    ...colsByRole(mapping, 'assignment', ['percentage', 'numeric', 'status']),
    ...colsByRole(mapping, 'certification', ['status']),
  ];
  const certCols = colsByRole(mapping, 'certification', ['status', 'percentage']);

  const avg = (cols: string[]) => {
    const vals = cols.map(c => parseNumeric(row[c] ?? '')).filter((n): n is number => n !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  let completionVals: number[] = [];
  for (const c of assignCols) {
    const cell = (row[c] ?? '').trim();
    const n = parseNumeric(cell);
    if (n !== null) completionVals.push(n <= 1 ? n * 100 : n);
    else if (cell && isCompletionStatus(cell)) completionVals.push(100);
    else if (cell) completionVals.push(0);
  }

  let certified = 0;
  for (const c of certCols) {
    if (isCompletionStatus(row[c] ?? '')) certified = 100;
  }
  if (!certCols.length && completionVals.length) certified = completionVals.reduce((a, b) => a + b, 0) / completionVals.length;

  const identity = Object.values(row).find(v => v.includes('@')) ?? Object.values(row)[0] ?? '';
  const riskScore = riskByKey.get(identity) ?? riskByKey.get(identity.toLowerCase()) ?? 50;

  return {
    attendance: avg(attCols),
    assessment: avg(assessCols),
    completion: completionVals.length ? completionVals.reduce((a, b) => a + b, 0) / completionVals.length : 0,
    certified,
    riskScore,
    isAtRisk: riskScore < 60,
  };
}

function healthCategory(score: number): HealthCategory {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Attention';
  return 'Critical';
}

/**
 * Operations health score (0–100):
 * - Attendance 25%
 * - Assessment 20%
 * - Assignments 20%
 * - Certification 15%
 * - Risk (inverted at-risk %) 15%
 * - Data quality 5%
 */
export function computeHealthScore(
  analytics: DynamicAnalyticsResult,
  dataQuality: DataQualityReport,
): OperationsHealthScore {
  const att = analytics.roleAware.attendance?.average ??
    analytics.percentageMetrics.filter(m => m.role === 'attendance').reduce((s, m) => s + m.average, 0) /
      Math.max(1, analytics.percentageMetrics.filter(m => m.role === 'attendance').length);

  const assess = analytics.roleAware.assessment?.average ??
    analytics.percentageMetrics.filter(m => m.role === 'assessment').reduce((s, m) => s + m.average, 0) /
      Math.max(1, analytics.percentageMetrics.filter(m => m.role === 'assessment').length);

  const assignments = analytics.roleAware.assignment?.completionRate ??
    analytics.statusMetrics.filter(m => m.role === 'assignment').reduce((s, m) => s + m.completionRate, 0) /
      Math.max(1, analytics.statusMetrics.filter(m => m.role === 'assignment').length);

  const certTotal = analytics.roleAware.certification;
  const certification = certTotal
    ? certTotal.certifiedCount + certTotal.notCertifiedCount > 0
      ? (certTotal.certifiedCount / (certTotal.certifiedCount + certTotal.notCertifiedCount)) * 100
      : 0
    : analytics.statusMetrics.filter(m => m.role === 'certification').reduce((s, m) => s + m.completionRate, 0) /
      Math.max(1, analytics.statusMetrics.filter(m => m.role === 'certification').length);

  const total = analytics.summary.totalRows || 1;
  const atRisk = (analytics.riskMetrics.counts['At Risk'] ?? 0) + (analytics.riskMetrics.counts['Critical Risk'] ?? 0);
  const riskComponent = Math.max(0, 100 - (atRisk / total) * 100);

  const issuePenalty = Math.min(30, dataQuality.issues.length * 3 + dataQuality.duplicateIdentifierGroups.length * 5);
  const dataQualityComponent = Math.max(0, 100 - issuePenalty);

  const score = round2(
    att * 0.25 +
    assess * 0.2 +
    assignments * 0.2 +
    certification * 0.15 +
    riskComponent * 0.15 +
    dataQualityComponent * 0.05,
  );

  return {
    score,
    category: healthCategory(score),
    components: {
      attendance: round2(att),
      assessment: round2(assess),
      assignments: round2(assignments),
      certification: round2(certification),
      risk: round2(riskComponent),
      dataQuality: round2(dataQualityComponent),
    },
  };
}

export function buildSnapshotMetrics(
  analytics: DynamicAnalyticsResult,
  health: OperationsHealthScore,
): UploadSnapshotMetrics {
  return {
    studentCount: analytics.summary.totalRows,
    avgAttendance: health.components.attendance,
    avgAssessment: health.components.assessment,
    completionRate: health.components.assignments,
    certificationRate: health.components.certification,
    atRiskCount: analytics.riskMetrics.counts['At Risk'] ?? 0,
    criticalRiskCount: analytics.riskMetrics.counts['Critical Risk'] ?? 0,
    healthScore: health.score,
  };
}

function compareGroups(
  rows: RawRow[],
  mapping: ColumnMapping,
  column: string,
  atRiskSet: Set<string>,
): GroupComparisonRow[] {
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const g = (row[column] ?? '').trim() || 'Unknown';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(row);
  }

  const riskByKey = new Map<string, number>();
  const rowIsAtRisk = (row: RawRow) =>
    Object.values(row).some(v => {
      const s = (v ?? '').trim();
      return s && (atRiskSet.has(s) || atRiskSet.has(s.toLowerCase()));
    });

  const result: GroupComparisonRow[] = [];
  for (const [groupValue, groupRows] of groups) {
    const metrics = groupRows.map(r => rowMetrics(r, mapping, riskByKey));
    const n = metrics.length || 1;
    const avgAttendance = metrics.reduce((s, m) => s + m.attendance, 0) / n;
    const avgAssessment = metrics.reduce((s, m) => s + m.assessment, 0) / n;
    const completionRate = metrics.reduce((s, m) => s + m.completion, 0) / n;
    const certificationRate = metrics.reduce((s, m) => s + m.certified, 0) / n;
    const riskPercent = (groupRows.filter(rowIsAtRisk).length / n) * 100;
    const compositeScore = round2((avgAttendance * 0.35 + avgAssessment * 0.3 + completionRate * 0.2 + certificationRate * 0.15));

    result.push({
      groupValue,
      studentCount: groupRows.length,
      avgAttendance: round2(avgAttendance),
      avgAssessment: round2(avgAssessment),
      completionRate: round2(completionRate),
      certificationRate: round2(certificationRate),
      riskPercent: round2(riskPercent),
      compositeScore,
    });
  }

  return result.sort((a, b) => b.compositeScore - a.compositeScore);
}

function buildTopPerformers(
  rows: RawRow[],
  mapping: ColumnMapping,
  column: string | null,
  riskByKey: Map<string, number>,
  atRiskSet: Set<string>,
  limit = 10,
): TopPerformerEntry[] {
  if (!column) {
    const entries = rows.map(row => {
      const m = rowMetrics(row, mapping, riskByKey);
      const label = Object.values(row).find(v => v && !v.includes('@')) ?? Object.values(row).find(Boolean) ?? 'Student';
      return {
        label: String(label),
        attendance: m.attendance,
        assessment: m.assessment,
        certification: m.certified,
        compositeScore: round2(m.attendance * 0.4 + m.assessment * 0.35 + m.certified * 0.25),
      };
    });
    return entries
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, limit)
      .map((e, i) => ({ rank: i + 1, ...e }));
  }

  const grouped = compareGroups(rows, mapping, column, atRiskSet);
  return grouped.slice(0, limit).map((g, i) => ({
    rank: i + 1,
    label: g.groupValue,
    attendance: g.avgAttendance,
    assessment: g.avgAssessment,
    certification: g.certificationRate,
    compositeScore: g.compositeScore,
  }));
}

function buildAtRiskSet(analytics: DynamicAnalyticsResult): Set<string> {
  const set = new Set<string>();
  for (const s of analytics.riskMetrics.students) {
    if (s.category !== 'At Risk' && s.category !== 'Critical Risk') continue;
    set.add(s.studentKey);
    set.add(s.studentKey.toLowerCase());
    set.add(s.studentLabel);
    set.add(s.studentLabel.toLowerCase());
  }
  return set;
}

function generateExecutiveInsights(
  analytics: DynamicAnalyticsResult,
  rows: RawRow[],
  mapping: ColumnMapping,
  health: OperationsHealthScore,
  trends: TrendMetric[],
): ProgramIntelligenceBundle['executiveInsights'] {
  const highlights: ExecutiveInsight[] = [];
  const warnings: ExecutiveInsight[] = [];
  const recommendations: ExecutiveInsight[] = [];

  const riskByKey = new Map(analytics.riskMetrics.students.map(s => [s.studentKey, s.score]));
  let lowAttCount = 0;
  for (const row of rows) {
    const m = rowMetrics(row, mapping, riskByKey);
    if (m.attendance > 0 && m.attendance < ATTENDANCE_THRESHOLD) lowAttCount++;
  }

  const atRisk = (analytics.riskMetrics.counts['At Risk'] ?? 0) + (analytics.riskMetrics.counts['Critical Risk'] ?? 0);
  if (atRisk > 0) {
    warnings.push({
      id: 'w-at-risk',
      category: 'warning',
      message: `${atRisk} student${atRisk === 1 ? '' : 's'} require immediate intervention.`,
    });
  }

  if (lowAttCount > 0) {
    warnings.push({
      id: 'w-low-att',
      category: 'warning',
      message: `Attendance is below ${ATTENDANCE_THRESHOLD}% for ${lowAttCount} student${lowAttCount === 1 ? '' : 's'}.`,
    });
  }

  const attTrend = trends.find(t => t.label === 'Average Attendance');
  if (attTrend?.direction === 'improved' && attTrend.deltaPercent !== null) {
    highlights.push({
      id: 'h-att-trend',
      category: 'highlight',
      message: `Attendance increased by ${Math.abs(attTrend.deltaPercent)}% compared to the previous upload.`,
    });
  }

  const certTrend = trends.find(t => t.label === 'Certification Rate');
  if (certTrend?.direction === 'improved' && certTrend.deltaPercent !== null) {
    highlights.push({
      id: 'h-cert-trend',
      category: 'highlight',
      message: `Certificate completion increased by ${Math.abs(certTrend.deltaPercent)}% compared to the previous upload.`,
    });
  }

  const assessMetrics = analytics.percentageMetrics.filter(m => m.role === 'assessment');
  if (assessMetrics.length) {
    const best = [...assessMetrics].sort((a, b) => b.average - a.average)[0];
    if (best.average >= 75) {
      highlights.push({
        id: 'h-assess',
        category: 'highlight',
        message: `${best.column} averages ${best.average}% across the cohort.`,
      });
    }
  }

  const dimensions = findDimensionColumns(mapping);
  const atRiskSet = buildAtRiskSet(analytics);
  for (const dim of dimensions.slice(0, 2)) {
    const groups = compareGroups(rows, mapping, dim.column, atRiskSet);
    if (groups.length >= 2) {
      const bestAssess = [...groups].sort((a, b) => b.avgAssessment - a.avgAssessment)[0];
      if (bestAssess.avgAssessment > 0) {
        highlights.push({
          id: `h-${dim.label}-assess`,
          category: 'highlight',
          message: `Assessment performance is strongest in ${dim.label} ${bestAssess.groupValue}.`,
        });
      }
      const bestComplete = [...groups].sort((a, b) => b.completionRate - a.completionRate)[0];
      if (bestComplete.completionRate > 0) {
        highlights.push({
          id: `h-${dim.label}-complete`,
          category: 'highlight',
          message: `${bestComplete.groupValue} has the highest completion rate (${bestComplete.completionRate}%).`,
        });
      }
    }
  }

  if (health.category === 'Excellent' || health.category === 'Good') {
    highlights.push({
      id: 'h-health',
      category: 'highlight',
      message: `Program health score is ${health.score}/100 (${health.category}).`,
    });
  } else {
    warnings.push({
      id: 'w-health',
      category: 'warning',
      message: `Program health score is ${health.score}/100 (${health.category}).`,
    });
    recommendations.push({
      id: 'r-health',
      category: 'recommendation',
      message: 'Review at-risk students and schedule cohort-wide check-ins this week.',
    });
  }

  if (atRisk > 5) {
    recommendations.push({
      id: 'r-intervention',
      category: 'recommendation',
      message: 'Prioritize outreach for At Risk and Critical Risk students within 48 hours.',
    });
  }

  return { highlights, warnings, recommendations };
}

function generateInterventions(
  analytics: DynamicAnalyticsResult,
  rows: RawRow[],
  mapping: ColumnMapping,
): InterventionRecommendation[] {
  const out: InterventionRecommendation[] = [];
  const riskByKey = new Map(analytics.riskMetrics.students.map(s => [s.studentKey, s.score]));

  for (const student of analytics.riskMetrics.students) {
    if (student.category !== 'At Risk' && student.category !== 'Critical Risk') continue;

    const row = rows.find(r => {
      const vals = Object.values(r);
      return vals.some(v => v === student.studentKey || v === student.studentLabel);
    });
    const m = row ? rowMetrics(row, mapping, riskByKey) : null;

    if (student.reasons.some(r => r.toLowerCase().includes('attendance')) || (m && m.attendance < ATTENDANCE_THRESHOLD)) {
      out.push({
        id: `int-${student.studentKey}-att`,
        studentKey: student.studentKey,
        studentLabel: student.studentLabel,
        type: 'attendance_outreach',
        title: 'Attendance outreach call',
        description: 'Recommend scheduling an outreach call to understand attendance barriers.',
        priority: student.category === 'Critical Risk' ? 'high' : 'medium',
      });
    }
    if (student.reasons.some(r => r.toLowerCase().includes('assessment'))) {
      out.push({
        id: `int-${student.studentKey}-mentor`,
        studentKey: student.studentKey,
        studentLabel: student.studentLabel,
        type: 'mentor_support',
        title: 'Mentor support',
        description: 'Recommend pairing with a mentor for assessment review sessions.',
        priority: 'medium',
      });
    }
    if (student.reasons.some(r => r.toLowerCase().includes('assignment'))) {
      out.push({
        id: `int-${student.studentKey}-asn`,
        studentKey: student.studentKey,
        studentLabel: student.studentLabel,
        type: 'assignment_followup',
        title: 'Assignment follow-up',
        description: 'Recommend follow-up on pending assignments and submission deadlines.',
        priority: 'high',
      });
    }
    if (student.reasons.some(r => r.toLowerCase().includes('engagement'))) {
      out.push({
        id: `int-${student.studentKey}-cert`,
        studentKey: student.studentKey,
        studentLabel: student.studentLabel,
        type: 'certification_reminder',
        title: 'Engagement & certification reminder',
        description: 'Recommend certification pathway review and engagement nudges.',
        priority: 'medium',
      });
    }
    if (!out.some(i => i.studentKey === student.studentKey)) {
      out.push({
        id: `int-${student.studentKey}-gen`,
        studentKey: student.studentKey,
        studentLabel: student.studentLabel,
        type: 'general_intervention',
        title: 'General intervention',
        description: student.reasons.join('. '),
        priority: 'high',
      });
    }
  }

  return out.slice(0, 100);
}

export function computeTrends(
  current: UploadSnapshotMetrics,
  previous: UploadSnapshot | null,
): TrendMetric[] {
  const defs: { label: string; key: keyof UploadSnapshotMetrics; unit: TrendMetric['unit'] }[] = [
    { label: 'Average Attendance', key: 'avgAttendance', unit: '%' },
    { label: 'Average Assessment', key: 'avgAssessment', unit: '%' },
    { label: 'Completion Rate', key: 'completionRate', unit: '%' },
    { label: 'Certification Rate', key: 'certificationRate', unit: '%' },
    { label: 'At-Risk Students', key: 'atRiskCount', unit: 'count' },
    { label: 'Critical Risk Students', key: 'criticalRiskCount', unit: 'count' },
    { label: 'Health Score', key: 'healthScore', unit: 'score' },
    { label: 'Student Count', key: 'studentCount', unit: 'count' },
  ];

  return defs.map(def => {
    const cur = current[def.key] as number;
    const prev = previous ? (previous.metrics[def.key] as number) : null;
    const delta = prev !== null ? round2(cur - prev) : null;
    const deltaPercent =
      prev !== null && prev !== 0 && def.unit === '%'
        ? round2(((cur - prev) / prev) * 100)
        : prev !== null && prev !== 0
          ? round2(((cur - prev) / prev) * 100)
          : null;

    let direction: TrendMetric['direction'] = 'unchanged';
    if (delta !== null) {
      if (Math.abs(delta) < 0.5) direction = 'unchanged';
      else if (def.label.includes('Risk') || def.label.includes('At-Risk')) {
        direction = delta < 0 ? 'improved' : 'declined';
      } else {
        direction = delta > 0 ? 'improved' : 'declined';
      }
    }

    return { label: def.label, current: cur, previous: prev, delta, deltaPercent, direction, unit: def.unit };
  });
}

function generateAlerts(
  analytics: DynamicAnalyticsResult,
  health: OperationsHealthScore,
  dataQuality: DataQualityReport,
  trends: TrendMetric[],
): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const total = analytics.summary.totalRows || 1;
  const atRiskPct = (((analytics.riskMetrics.counts['At Risk'] ?? 0) + (analytics.riskMetrics.counts['Critical Risk'] ?? 0)) / total) * 100;

  if (atRiskPct >= 25) {
    alerts.push({
      id: 'alert-risk-high',
      severity: 'critical',
      title: 'High risk concentration',
      message: `${round2(atRiskPct)}% of students are At Risk or Critical Risk.`,
    });
  } else if (atRiskPct >= 15) {
    alerts.push({
      id: 'alert-risk-med',
      severity: 'warning',
      title: 'Elevated risk levels',
      message: `${round2(atRiskPct)}% of students need intervention support.`,
    });
  }

  if (health.components.attendance < ATTENDANCE_THRESHOLD) {
    alerts.push({
      id: 'alert-att',
      severity: 'warning',
      title: 'Low program attendance',
      message: `Average attendance is ${health.components.attendance}% (below ${ATTENDANCE_THRESHOLD}%).`,
    });
  }

  if (health.components.assessment < 60) {
    alerts.push({
      id: 'alert-assess',
      severity: 'warning',
      title: 'Poor assessment performance',
      message: `Average assessment score is ${health.components.assessment}%.`,
    });
  }

  if (health.components.assignments < 50) {
    alerts.push({
      id: 'alert-complete',
      severity: 'warning',
      title: 'Low completion rate',
      message: `Assignment completion is ${health.components.assignments}%.`,
    });
  }

  if (dataQuality.issues.filter(i => i.severity === 'error').length > 0) {
    alerts.push({
      id: 'alert-dq',
      severity: 'critical',
      title: 'Data quality errors',
      message: `${dataQuality.issues.filter(i => i.severity === 'error').length} critical data issue(s) detected.`,
    });
  } else if (dataQuality.issues.length > 5) {
    alerts.push({
      id: 'alert-dq-warn',
      severity: 'warning',
      title: 'Data quality warnings',
      message: `${dataQuality.issues.length} data quality warnings — review before reporting.`,
    });
  }

  const studentTrend = trends.find(t => t.label === 'Student Count');
  if (studentTrend && studentTrend.delta !== null && Math.abs(studentTrend.delta) >= 20) {
    alerts.push({
      id: 'alert-upload-change',
      severity: 'info',
      title: 'Large upload change',
      message: `Student count changed by ${studentTrend.delta > 0 ? '+' : ''}${studentTrend.delta} vs previous upload.`,
    });
  }

  const riskTrend = trends.find(t => t.label === 'At-Risk Students');
  if (riskTrend?.direction === 'improved' && riskTrend.delta !== null && riskTrend.delta < 0) {
    alerts.push({
      id: 'alert-risk-improved',
      severity: 'info',
      title: 'Risk improving',
      message: `At-risk students reduced by ${Math.abs(riskTrend.delta)} compared to previous upload.`,
    });
  }

  return alerts;
}

function buildCollegeReportCards(
  rows: RawRow[],
  mapping: ColumnMapping,
  atRiskSet: Set<string>,
  riskByKey: Map<string, number>,
): CollegeReportCard[] {
  const collegeCol =
    Object.keys(mapping).find(c => /college|university|institution/i.test(c) && mapping[c].mappedType === 'category') ??
    null;
  if (!collegeCol) return [];

  const groups = compareGroups(rows, mapping, collegeCol, atRiskSet);

  return groups.map(g => {
    const groupRows = rows.filter(r => ((r[collegeCol] ?? '').trim() || 'Unknown') === g.groupValue);
    const topStudents = groupRows
      .map(row => {
        const m = rowMetrics(row, mapping, riskByKey);
        const name = Object.values(row).find(v => v && !v.includes('@') && v.length > 2) ?? '';
        return { name, score: m.attendance * 0.4 + m.assessment * 0.35 + m.certified * 0.25 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.name)
      .filter(Boolean);

    const hs = g.compositeScore;
    return {
      college: g.groupValue,
      studentCount: g.studentCount,
      avgAttendance: g.avgAttendance,
      avgAssessment: g.avgAssessment,
      completionRate: g.completionRate,
      certificationRate: g.certificationRate,
      riskPercent: g.riskPercent,
      healthScore: round2(hs),
      healthCategory: healthCategory(hs),
      topStudents,
    };
  });
}

export function generateProgramIntelligence(input: {
  analytics: DynamicAnalyticsResult;
  rows: RawRow[];
  mapping: ColumnMapping;
  dataQuality: DataQualityReport;
  previousSnapshot: UploadSnapshot | null;
}): ProgramIntelligenceBundle {
  const { analytics, rows, mapping, dataQuality, previousSnapshot } = input;

  const health = computeHealthScore(analytics, dataQuality);
  const currentMetrics = buildSnapshotMetrics(analytics, health);
  const trends = computeTrends(currentMetrics, previousSnapshot);

  const atRiskSet = buildAtRiskSet(analytics);
  const riskByKey = new Map(
    analytics.riskMetrics.students.flatMap(s => [
      [s.studentKey, s.score],
      [s.studentKey.toLowerCase(), s.score],
    ]),
  );

  const dimensions = findDimensionColumns(mapping);
  const cohortComparisons: CohortComparisonDimension[] = dimensions.map(d => ({
    column: d.column,
    label: d.label,
    rows: compareGroups(rows, mapping, d.column, atRiskSet),
  }));

  const collegeCol = dimensions.find(d => d.label === 'College')?.column ?? null;
  const cohortCol = dimensions.find(d => d.label === 'Cohort')?.column ?? null;
  const programCol = dimensions.find(d => d.label === 'Program')?.column ?? null;

  const topPerformers: TopPerformerIntelligence = {
    students: buildTopPerformers(rows, mapping, null, riskByKey, atRiskSet, 10),
    colleges: buildTopPerformers(rows, mapping, collegeCol, riskByKey, atRiskSet, 10),
    cohorts: buildTopPerformers(rows, mapping, cohortCol, riskByKey, atRiskSet, 10),
    programs: buildTopPerformers(rows, mapping, programCol, riskByKey, atRiskSet, 10),
  };

  const interventions = generateInterventions(analytics, rows, mapping);
  const executiveInsights = generateExecutiveInsights(analytics, rows, mapping, health, trends);
  const alerts = generateAlerts(analytics, health, dataQuality, trends);
  const collegeReportCards = buildCollegeReportCards(rows, mapping, atRiskSet, riskByKey);

  return {
    executiveInsights,
    cohortComparisons,
    topPerformers,
    interventions,
    trends,
    healthScore: health,
    alerts,
    collegeReportCards,
  };
}
