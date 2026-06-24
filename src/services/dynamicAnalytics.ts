import type { BusinessRole, ColumnMapping, ColumnType } from '../types/dynamicSchema';

type RawRow = Record<string, string>;

export interface RankedStudent {
  studentKey: string;
  studentLabel: string;
  value: number;
}

export interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface PercentageMetric {
  column: string;
  role: BusinessRole;
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
  distribution: DistributionBucket[];
  top10: RankedStudent[];
  bottom10: RankedStudent[];
}

export interface NumericMetric {
  column: string;
  role: BusinessRole;
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
  distribution: DistributionBucket[];
  ranking: RankedStudent[];
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface StatusMetric {
  column: string;
  role: BusinessRole;
  total: number;
  completionRate: number;
  breakdown: StatusBreakdown[];
}

export interface CategoryValue {
  value: string;
  count: number;
  percentage: number;
}

export interface CategoryMetric {
  column: string;
  role: BusinessRole;
  total: number;
  distinctCount: number;
  values: CategoryValue[];
  filterMeta: { options: string[] };
}

export interface TextColumnMeta {
  column: string;
  role: BusinessRole;
  nonEmptyCount: number;
  sampleValues: string[];
  searchable: true;
}

export interface RoleAwareAnalytics {
  attendance: {
    average: number;
    distribution: DistributionBucket[];
    leaderboard: RankedStudent[];
  } | null;
  assessment: {
    average: number;
    distribution: DistributionBucket[];
    topPerformers: RankedStudent[];
  } | null;
  assignment: {
    completionRate: number;
    pendingRate: number;
    statusColumns: string[];
  } | null;
  certification: {
    certifiedCount: number;
    notCertifiedCount: number;
  } | null;
  participation: {
    average: number;
    distribution: DistributionBucket[];
  } | null;
}

export interface RiskStudent {
  studentKey: string;
  studentLabel: string;
  score: number;
  category: 'Top Performer' | 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical Risk';
  reasons: string[];
}

export interface RiskMetrics {
  counts: Record<RiskStudent['category'], number>;
  students: RiskStudent[];
}

export interface DynamicAnalyticsResult {
  percentageMetrics: PercentageMetric[];
  numericMetrics: NumericMetric[];
  statusMetrics: StatusMetric[];
  categoryMetrics: CategoryMetric[];
  textColumns: TextColumnMeta[];
  roleAware: RoleAwareAnalytics;
  riskMetrics: RiskMetrics;
  summary: {
    totalRows: number;
    processedRows: number;
    mappedColumns: number;
    columnsByType: Record<ColumnType, number>;
    generatedAt: string;
  };
}

interface StudentIdentity {
  key: string;
  label: string;
}

function normalize(v: string): string {
  return (v ?? '').trim();
}

function isCompletionStatus(v: string): boolean {
  const s = v.toLowerCase();
  return ['submitted', 'complete', 'completed', 'done', 'certified', 'pass', 'passed', 'yes', 'true'].includes(s);
}

function isPendingStatus(v: string): boolean {
  const s = v.toLowerCase();
  return ['pending', 'incomplete', 'not certified', 'fail', 'failed', 'no', 'false', 'late', 'late submission'].includes(s);
}

function parseNumeric(raw: string): number | null {
  const v = normalize(raw).replace(/,/g, '');
  if (!v) return null;
  const ratio = v.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    if (b > 0) return (a / b) * 100;
  }
  const n = Number(v.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function percentileMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildDistribution(values: number[], minFloor = 0, maxCeil = 100): DistributionBucket[] {
  if (!values.length) return [];
  const min = Math.min(minFloor, ...values);
  const max = Math.max(maxCeil, ...values);
  const span = Math.max(1, max - min);
  const bucketSize = Math.ceil(span / 5);
  const total = values.length;
  const out: DistributionBucket[] = [];
  for (let i = 0; i < 5; i++) {
    const bMin = min + i * bucketSize;
    const bMax = i === 4 ? max : bMin + bucketSize - 0.000001;
    const count = values.filter(v => v >= bMin && (i === 4 ? v <= bMax : v < bMin + bucketSize)).length;
    out.push({
      label: `${round2(bMin)}-${round2(i === 4 ? bMax : bMin + bucketSize)}`,
      min: bMin,
      max: i === 4 ? bMax : bMin + bucketSize,
      count,
      percentage: total ? round2((count / total) * 100) : 0,
    });
  }
  return out;
}

function sortRankings(items: RankedStudent[], direction: 'asc' | 'desc'): RankedStudent[] {
  const sorted = [...items].sort((a, b) => direction === 'asc' ? a.value - b.value : b.value - a.value);
  return sorted;
}

function detectIdentityColumns(mapping: ColumnMapping): string[] {
  return Object.entries(mapping)
    .filter(([, m]) => m.mappedType === 'identifier')
    .map(([column]) => column);
}

function identityForRow(row: RawRow, idColumns: string[], rowIdx: number): StudentIdentity {
  const values = idColumns.map(c => normalize(row[c])).filter(Boolean);
  const email = values.find(v => v.includes('@'));
  const nameLike = values.find(v => !v.includes('@') && /[a-zA-Z]/.test(v));
  const key = email || values[0] || `row-${rowIdx + 1}`;
  const label = nameLike || email || key;
  return { key, label };
}

function collectColumnNumbers(rows: RawRow[], column: string, asPercent = false): number[] {
  const nums = rows
    .map(r => parseNumeric(r[column] ?? ''))
    .filter((n): n is number => n !== null);
  if (!asPercent) return nums;
  return nums.map(n => n <= 1 ? n * 100 : n).map(n => Math.max(0, Math.min(100, n)));
}

function roleAverage(metrics: { role: BusinessRole; average: number }[], role: BusinessRole): number {
  const vals = metrics.filter(m => m.role === role).map(m => m.average);
  return vals.length ? average(vals) : 0;
}

function roleDistributionsPercentage(metrics: PercentageMetric[], role: BusinessRole): DistributionBucket[] {
  const combined = metrics
    .filter(m => m.role === role)
    .flatMap(m => {
      const vals: number[] = [];
      m.distribution.forEach(b => {
        for (let i = 0; i < b.count; i++) vals.push((b.min + b.max) / 2);
      });
      return vals;
    });
  return buildDistribution(combined, 0, 100);
}

export function generateRiskMetrics(
  rows: RawRow[],
  mapping: ColumnMapping,
): RiskMetrics {
  const idColumns = detectIdentityColumns(mapping);
  const attendanceCols = Object.entries(mapping).filter(([, m]) => m.mappedRole === 'attendance' && (m.mappedType === 'percentage' || m.mappedType === 'numeric')).map(([c]) => c);
  const assessmentCols = Object.entries(mapping).filter(([, m]) => m.mappedRole === 'assessment' && (m.mappedType === 'percentage' || m.mappedType === 'numeric')).map(([c]) => c);
  const assignmentCols = Object.entries(mapping).filter(([, m]) => m.mappedRole === 'assignment' && (m.mappedType === 'status' || m.mappedType === 'percentage' || m.mappedType === 'numeric')).map(([c]) => c);
  const engagementCols = Object.entries(mapping).filter(([, m]) => m.mappedRole === 'engagement' && (m.mappedType === 'percentage' || m.mappedType === 'numeric')).map(([c]) => c);

  const students: RiskStudent[] = rows.map((row, idx) => {
    const identity = identityForRow(row, idColumns, idx);

    const attendanceVals = attendanceCols.map(c => parseNumeric(row[c] ?? '')).filter((n): n is number => n !== null).map(n => (n <= 1 ? n * 100 : n));
    const assessmentVals = assessmentCols.map(c => parseNumeric(row[c] ?? '')).filter((n): n is number => n !== null).map(n => (n <= 1 ? n * 100 : n));
    const engagementVals = engagementCols.map(c => parseNumeric(row[c] ?? '')).filter((n): n is number => n !== null).map(n => (n <= 1 ? n * 100 : n));

    const assignmentVals: number[] = [];
    assignmentCols.forEach(c => {
      const cell = normalize(row[c] ?? '');
      const n = parseNumeric(cell);
      if (n !== null) {
        assignmentVals.push(n <= 1 ? n * 100 : n);
        return;
      }
      if (!cell) return;
      if (isCompletionStatus(cell)) assignmentVals.push(100);
      else if (isPendingStatus(cell)) assignmentVals.push(0);
    });

    const attendance = attendanceVals.length ? average(attendanceVals) : 0;
    const assessment = assessmentVals.length ? average(assessmentVals) : 0;
    const assignment = assignmentVals.length ? average(assignmentVals) : 0;
    const engagement = engagementVals.length ? average(engagementVals) : ((attendance * 0.4) + (assessment * 0.3) + (assignment * 0.3));

    const score = round2((attendance * 0.35) + (assessment * 0.3) + (assignment * 0.25) + (engagement * 0.1));
    const reasons: string[] = [];
    if (attendance < 60) reasons.push('Low attendance');
    if (assessment < 60) reasons.push('Low assessment performance');
    if (assignment < 60) reasons.push('Assignment completion risk');
    if (engagement < 60) reasons.push('Low engagement');

    let category: RiskStudent['category'];
    if (score >= 90) category = 'Top Performer';
    else if (score >= 75) category = 'Healthy';
    else if (score >= 60) category = 'Needs Attention';
    else if (score >= 40) category = 'At Risk';
    else category = 'Critical Risk';

    return {
      studentKey: identity.key,
      studentLabel: identity.label,
      score,
      category,
      reasons: reasons.length ? reasons : ['No specific risk signals'],
    };
  });

  const counts: RiskMetrics['counts'] = {
    'Top Performer': students.filter(s => s.category === 'Top Performer').length,
    Healthy: students.filter(s => s.category === 'Healthy').length,
    'Needs Attention': students.filter(s => s.category === 'Needs Attention').length,
    'At Risk': students.filter(s => s.category === 'At Risk').length,
    'Critical Risk': students.filter(s => s.category === 'Critical Risk').length,
  };

  const ordered = [...students].sort((a, b) => a.score - b.score);
  return { counts, students: ordered };
}

export function generateDynamicAnalytics(
  rows: RawRow[],
  mappings: ColumnMapping,
): DynamicAnalyticsResult {
  const mappedEntries = Object.entries(mappings).filter(([, m]) => m.mappedType !== 'ignore');
  const idColumns = detectIdentityColumns(mappings);

  const percentageMetrics: PercentageMetric[] = [];
  const numericMetrics: NumericMetric[] = [];
  const statusMetrics: StatusMetric[] = [];
  const categoryMetrics: CategoryMetric[] = [];
  const textColumns: TextColumnMeta[] = [];

  for (const [column, mapping] of mappedEntries) {
    if (mapping.mappedType === 'percentage') {
      const values = collectColumnNumbers(rows, column, true);
      const ranked = rows
        .map((row, idx) => {
          const n = parseNumeric(row[column] ?? '');
          if (n === null) return null;
          const v = n <= 1 ? n * 100 : n;
          const identity = identityForRow(row, idColumns, idx);
          return { studentKey: identity.key, studentLabel: identity.label, value: round2(v) };
        })
        .filter((x): x is RankedStudent => x !== null);

      percentageMetrics.push({
        column,
        role: mapping.mappedRole,
        count: values.length,
        average: round2(average(values)),
        median: round2(percentileMedian(values)),
        min: values.length ? round2(Math.min(...values)) : 0,
        max: values.length ? round2(Math.max(...values)) : 0,
        distribution: buildDistribution(values, 0, 100),
        top10: sortRankings(ranked, 'desc').slice(0, 10),
        bottom10: sortRankings(ranked, 'asc').slice(0, 10),
      });
      continue;
    }

    if (mapping.mappedType === 'numeric') {
      const values = collectColumnNumbers(rows, column, false);
      const ranked = rows
        .map((row, idx) => {
          const n = parseNumeric(row[column] ?? '');
          if (n === null) return null;
          const identity = identityForRow(row, idColumns, idx);
          return { studentKey: identity.key, studentLabel: identity.label, value: round2(n) };
        })
        .filter((x): x is RankedStudent => x !== null);

      numericMetrics.push({
        column,
        role: mapping.mappedRole,
        count: values.length,
        average: round2(average(values)),
        median: round2(percentileMedian(values)),
        min: values.length ? round2(Math.min(...values)) : 0,
        max: values.length ? round2(Math.max(...values)) : 0,
        distribution: buildDistribution(values),
        ranking: sortRankings(ranked, 'desc'),
      });
      continue;
    }

    if (mapping.mappedType === 'status') {
      const values = rows.map(r => normalize(r[column] ?? '')).filter(Boolean);
      const total = values.length;
      const byStatus = new Map<string, number>();
      values.forEach(v => byStatus.set(v, (byStatus.get(v) ?? 0) + 1));
      const completionValues = values.filter(isCompletionStatus);
      statusMetrics.push({
        column,
        role: mapping.mappedRole,
        total,
        completionRate: total ? round2((completionValues.length / total) * 100) : 0,
        breakdown: [...byStatus.entries()].map(([status, count]) => ({
          status,
          count,
          percentage: total ? round2((count / total) * 100) : 0,
        })),
      });
      continue;
    }

    if (mapping.mappedType === 'category') {
      const values = rows.map(r => normalize(r[column] ?? '')).filter(Boolean);
      const total = values.length;
      const byValue = new Map<string, number>();
      values.forEach(v => byValue.set(v, (byValue.get(v) ?? 0) + 1));
      const valueRows = [...byValue.entries()]
        .map(([value, count]) => ({
          value,
          count,
          percentage: total ? round2((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      categoryMetrics.push({
        column,
        role: mapping.mappedRole,
        total,
        distinctCount: byValue.size,
        values: valueRows,
        filterMeta: { options: valueRows.map(v => v.value) },
      });
      continue;
    }

    if (mapping.mappedType === 'text' || mapping.mappedType === 'identifier') {
      const values = rows.map(r => normalize(r[column] ?? '')).filter(Boolean);
      textColumns.push({
        column,
        role: mapping.mappedRole,
        nonEmptyCount: values.length,
        sampleValues: values.slice(0, 10),
        searchable: true,
      });
    }
  }

  const attendanceMetrics = percentageMetrics.filter(m => m.role === 'attendance');
  const assessmentMetrics = percentageMetrics.filter(m => m.role === 'assessment');
  const assignmentStatus = statusMetrics.filter(m => m.role === 'assignment');
  const certificationStatus = statusMetrics.filter(m => m.role === 'certification');
  const participationNumeric = numericMetrics.filter(m => m.role === 'participation');

  const attendanceLeaderboard = sortRankings(
    attendanceMetrics.flatMap(m => m.top10.map(t => ({ ...t, value: t.value }))),
    'desc',
  ).slice(0, 10);
  const assessmentTop = sortRankings(
    assessmentMetrics.flatMap(m => m.top10.map(t => ({ ...t, value: t.value }))),
    'desc',
  ).slice(0, 10);

  const roleAware: RoleAwareAnalytics = {
    attendance: attendanceMetrics.length
      ? {
          average: round2(roleAverage(attendanceMetrics.map(m => ({ role: m.role, average: m.average })), 'attendance')),
          distribution: roleDistributionsPercentage(percentageMetrics, 'attendance'),
          leaderboard: attendanceLeaderboard,
        }
      : null,
    assessment: assessmentMetrics.length
      ? {
          average: round2(roleAverage(assessmentMetrics.map(m => ({ role: m.role, average: m.average })), 'assessment')),
          distribution: roleDistributionsPercentage(percentageMetrics, 'assessment'),
          topPerformers: assessmentTop,
        }
      : null,
    assignment: assignmentStatus.length
      ? {
          completionRate: round2(average(assignmentStatus.map(s => s.completionRate))),
          pendingRate: round2(100 - average(assignmentStatus.map(s => s.completionRate))),
          statusColumns: assignmentStatus.map(s => s.column),
        }
      : null,
    certification: certificationStatus.length
      ? {
          certifiedCount: certificationStatus.reduce((sum, s) => {
            const cert = s.breakdown.find(b => isCompletionStatus(b.status));
            return sum + (cert?.count ?? 0);
          }, 0),
          notCertifiedCount: certificationStatus.reduce((sum, s) => {
            const cert = s.breakdown.find(b => isCompletionStatus(b.status));
            return sum + (s.total - (cert?.count ?? 0));
          }, 0),
        }
      : null,
    participation: participationNumeric.length
      ? {
          average: round2(average(participationNumeric.map(n => n.average))),
          distribution: buildDistribution(participationNumeric.flatMap(n => n.ranking.map(r => r.value))),
        }
      : null,
  };

  const riskMetrics = generateRiskMetrics(rows, mappings);

  const columnsByType: Record<ColumnType, number> = {
    identifier: 0,
    category: 0,
    numeric: 0,
    percentage: 0,
    status: 0,
    text: 0,
    ignore: 0,
  };
  Object.values(mappings).forEach(m => {
    columnsByType[m.mappedType] = (columnsByType[m.mappedType] ?? 0) + 1;
  });

  return {
    percentageMetrics,
    numericMetrics,
    statusMetrics,
    categoryMetrics,
    textColumns,
    roleAware,
    riskMetrics,
    summary: {
      totalRows: rows.length,
      processedRows: rows.length,
      mappedColumns: mappedEntries.length,
      columnsByType,
      generatedAt: new Date().toISOString(),
    },
  };
}
