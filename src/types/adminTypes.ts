// Brand color palette used across the admin dashboard
export const BRAND = {
  navy: '#2F4F7F',
  navyDark: '#243d63',
  navyLight: '#3d6299',
  yellow: '#F2C62C',
  yellowDark: '#d6ac1f',
  green: '#7CB342',
  greenDark: '#65972f',
  text: '#2E2E2E',
  textLight: '#6b7280',
  textMuted: '#9ca3af',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  red: '#EF4444',
  redLight: '#fee2e2',
  blue: '#3B82F6',
  blueLight: '#dbeafe',
  yellowLight: '#fef3c7',
  greenLight: '#dcfce7',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
} as const;

export type RiskCategory = 'Excellent' | 'Good' | 'Needs Attention' | 'At Risk';

export type StudentStatus = 'Active' | 'Inactive' | 'On Leave' | 'Completed';

export type CohortName = string;

export type ProgramName = string;

export type StateName = string;

export interface Student {
  id: string;
  name: string;
  email: string;
  college: string;
  cohort: CohortName;
  program: ProgramName;
  state: StateName;
  attendance: number;
  assignmentCompletion: number;
  quizAverage: number;
  engagementScore: number;
  riskCategory: RiskCategory;
  status: StudentStatus;
  riskScore: number;
  certificateStatus?: string;
}

export interface KPI {
  id: string;
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'flat';
  accent?: 'navy' | 'yellow' | 'green' | 'red';
  iconName: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export type SyncStatus = 'Success' | 'Failed' | 'Partial';

export interface SyncLog {
  id: string;
  timestamp: string;
  status: SyncStatus;
  imported: number;
  updated: number;
  failed: number;
  message: string;
  durationSeconds: number;
}

export type RiskType =
  | 'Low Attendance'
  | 'Assignment Backlog'
  | 'Low Quiz Performance'
  | 'Attend But Not Submit'
  | 'Submit But Low Attendance'
  | 'High Risk';

export interface RiskStudent {
  studentId: string;
  name: string;
  email: string;
  cohort: CohortName;
  college: string;
  riskType: RiskType;
  attendance: number;
  assignmentCompletion: number;
  quizAverage: number;
  riskScore: number;
  suggestedAction: string;
}

export interface Filters {
  cohorts: string[];
  colleges: string[];
  states: string[];
  programs: string[];
  dateFrom: string;
  dateTo: string;
  attendanceMin: number;
  attendanceMax: number;
  assignmentMin: number;
  assignmentMax: number;
  quizMin: number;
  quizMax: number;
  engagementMin: number;
  engagementMax: number;
}

export type SidebarSection =
  | 'program-overview'
  | 'portal-analytics'
  | 'dashboard'
  | 'profile-approvals'
  | 'students'
  | 'data-source'
  | 'cohort-overview'
  | 'attendance'
  | 'assignments'
  | 'quizzes'
  | 'risk'
  | 'weekly-ops'
  | 'cohort-comparison'
  | 'help-center'
  | 'system-health'
  | 'sync'
  | 'settings';

export interface SidebarItem {
  id: SidebarSection;
  label: string;
  iconName: string;
}

export interface CohortMetric {
  cohort: CohortName;
  totalStudents: number;
  attendance: number;
  assignmentCompletion: number;
  quizAverage: number;
  engagementScore: number;
  atRisk: number;
  topPerformers: number;
}

export interface WeeklyChange {
  metric: string;
  current: number;
  previous: number;
  change: number;
  unit: string;
}

export interface WeeklyMovement {
  studentId: string;
  name: string;
  cohort: CohortName;
  previousScore: number;
  currentScore: number;
  delta: number;
  reason: string;
}
