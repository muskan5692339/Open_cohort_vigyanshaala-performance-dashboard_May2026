export type InsightCategory = 'highlight' | 'warning' | 'recommendation';

export interface ExecutiveInsight {
  id: string;
  category: InsightCategory;
  message: string;
  metricKey?: string;
}

export interface GroupComparisonRow {
  groupValue: string;
  studentCount: number;
  avgAttendance: number;
  avgAssessment: number;
  completionRate: number;
  certificationRate: number;
  riskPercent: number;
  compositeScore: number;
}

export interface CohortComparisonDimension {
  column: string;
  label: string;
  rows: GroupComparisonRow[];
}

export interface TopPerformerEntry {
  rank: number;
  label: string;
  attendance: number;
  assessment: number;
  certification: number;
  compositeScore: number;
}

export interface TopPerformerIntelligence {
  students: TopPerformerEntry[];
  colleges: TopPerformerEntry[];
  cohorts: TopPerformerEntry[];
  programs: TopPerformerEntry[];
}

export type InterventionType =
  | 'attendance_outreach'
  | 'mentor_support'
  | 'assignment_followup'
  | 'certification_reminder'
  | 'general_intervention';

export interface InterventionRecommendation {
  id: string;
  studentKey: string;
  studentLabel: string;
  type: InterventionType;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RecommendationHistoryRecord {
  id: string;
  recommendation: InterventionRecommendation;
  generatedAt: string;
  acknowledged?: boolean;
}

export type TrendDirection = 'improved' | 'declined' | 'unchanged';

export interface TrendMetric {
  label: string;
  current: number;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
  direction: TrendDirection;
  unit: '%' | 'count' | 'score';
}

export interface UploadSnapshotMetrics {
  studentCount: number;
  avgAttendance: number;
  avgAssessment: number;
  completionRate: number;
  certificationRate: number;
  atRiskCount: number;
  criticalRiskCount: number;
  healthScore: number;
}

export interface UploadSnapshot {
  id: string;
  fileName: string;
  uploadedAt: string;
  metrics: UploadSnapshotMetrics;
}

export type HealthCategory = 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';

export interface OperationsHealthScore {
  score: number;
  category: HealthCategory;
  components: {
    attendance: number;
    assessment: number;
    assignments: number;
    certification: number;
    risk: number;
    dataQuality: number;
  };
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
}

export interface CollegeReportCard {
  college: string;
  studentCount: number;
  avgAttendance: number;
  avgAssessment: number;
  completionRate: number;
  certificationRate: number;
  riskPercent: number;
  healthScore: number;
  healthCategory: HealthCategory;
  topStudents: string[];
}

export interface ProgramIntelligenceBundle {
  executiveInsights: {
    highlights: ExecutiveInsight[];
    warnings: ExecutiveInsight[];
    recommendations: ExecutiveInsight[];
  };
  cohortComparisons: CohortComparisonDimension[];
  topPerformers: TopPerformerIntelligence;
  interventions: InterventionRecommendation[];
  trends: TrendMetric[];
  healthScore: OperationsHealthScore;
  alerts: SmartAlert[];
  collegeReportCards: CollegeReportCard[];
}
