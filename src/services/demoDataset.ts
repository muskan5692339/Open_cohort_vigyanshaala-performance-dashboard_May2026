import type { ColumnMapping, DiscoveredColumn } from '../types/dynamicSchema';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';

const DEMO_FILE = 'VigyanShaala_Demo_Dataset.xlsx';

function row(
  name: string,
  email: string,
  college: string,
  cohort: string,
  state: string,
  att: string,
  quiz: string,
  assign: string,
  cert: string,
): Record<string, string> {
  return {
    Name: name,
    Email: email,
    College: college,
    Cohort: cohort,
    State: state,
    'Attendance %': att,
    'Quiz Score': quiz,
    'Assignment Status': assign,
    'Certificate Status': cert,
  };
}

const DEMO_ROWS: Record<string, string>[] = [
  row('Priya Sharma', 'priya@demo.vs', 'IIT Hyderabad', 'Cohort A', 'Telangana', '92', '88', 'Submitted', 'Certified'),
  row('Rahul Kumar', 'rahul@demo.vs', 'NIT Warangal', 'Cohort A', 'Telangana', '78', '72', 'Submitted', 'Pending'),
  row('Ananya Patel', 'ananya@demo.vs', 'BITS Pilani', 'Cohort B', 'Rajasthan', '85', '91', 'Submitted', 'Certified'),
  row('Vikram Singh', 'vikram@demo.vs', 'Delhi University', 'Cohort B', 'Delhi', '62', '58', 'Pending', 'Not Certified'),
  row('Sneha Reddy', 'sneha@demo.vs', 'IIT Hyderabad', 'Cohort A', 'Telangana', '95', '94', 'Submitted', 'Certified'),
  row('Arjun Mehta', 'arjun@demo.vs', 'Pune University', 'Cohort C', 'Maharashtra', '55', '49', 'Late Submission', 'Not Certified'),
  row('Kavya Nair', 'kavya@demo.vs', 'CUSAT Kochi', 'Cohort C', 'Kerala', '88', '86', 'Submitted', 'Certified'),
  row('Mohit Agarwal', 'mohit@demo.vs', 'NIT Warangal', 'Cohort A', 'Telangana', '71', '68', 'Submitted', 'Pending'),
  row('Divya Iyer', 'divya@demo.vs', 'Anna University', 'Cohort B', 'Tamil Nadu', '80', '77', 'Submitted', 'Certified'),
  row('Rohan Das', 'rohan@demo.vs', 'Delhi University', 'Cohort B', 'Delhi', '48', '52', 'Pending', 'Not Certified'),
  row('Meera Joshi', 'meera@demo.vs', 'Pune University', 'Cohort C', 'Maharashtra', '90', '89', 'Submitted', 'Certified'),
  row('Karan Malhotra', 'karan@demo.vs', 'BITS Pilani', 'Cohort B', 'Rajasthan', '67', '61', 'Submitted', 'Pending'),
];

const HEADERS = Object.keys(DEMO_ROWS[0]);

const DEMO_MAPPING: ColumnMapping = {
  Name: { mappedType: 'identifier', mappedRole: 'demographic', mappedDisplayGroup: 'profile' },
  Email: { mappedType: 'identifier', mappedRole: 'demographic', mappedDisplayGroup: 'profile' },
  College: { mappedType: 'category', mappedRole: 'demographic', mappedDisplayGroup: 'profile' },
  Cohort: { mappedType: 'category', mappedRole: 'program', mappedDisplayGroup: 'program' },
  State: { mappedType: 'category', mappedRole: 'demographic', mappedDisplayGroup: 'profile' },
  'Attendance %': { mappedType: 'percentage', mappedRole: 'attendance', mappedDisplayGroup: 'performance' },
  'Quiz Score': { mappedType: 'percentage', mappedRole: 'assessment', mappedDisplayGroup: 'performance' },
  'Assignment Status': { mappedType: 'status', mappedRole: 'assignment', mappedDisplayGroup: 'assignments' },
  'Certificate Status': { mappedType: 'status', mappedRole: 'certification', mappedDisplayGroup: 'certification' },
};

const DEMO_DISCOVERED: DiscoveredColumn[] = HEADERS.map((name, index) => {
  const m = DEMO_MAPPING[name];
  return {
    name,
    index,
    sampleValues: DEMO_ROWS.slice(0, 3).map(r => r[name]),
    inferredType: m.mappedType,
    inferredRole: m.mappedRole,
    inferredDisplayGroup: m.mappedDisplayGroup,
    typeConfidence: 0.95,
    roleConfidence: 0.9,
    displayGroupConfidence: 0.9,
    mappedType: m.mappedType,
    mappedRole: m.mappedRole,
    mappedDisplayGroup: m.mappedDisplayGroup,
  };
});

export function buildDemoPayload(cohortName = 'Demo Cohort'): ParsedExcelPayload {
  const students = DEMO_ROWS.map((r, i) => ({
    student_id: `demo-${i + 1}`,
    name: r.Name,
    email: r.Email,
    cohort: r.Cohort,
    program: 'Incubator',
    state: r.State,
    status: 'Active' as const,
    college: r.College,
    imported_attendance_pct: parseInt(r['Attendance %'], 10),
    imported_assignment_pct: r['Assignment Status'].includes('Submitted') ? 100 : 40,
    imported_quiz_pct: parseInt(r['Quiz Score'], 10),
  }));

  return {
    cohortName,
    fileName: DEMO_FILE,
    students,
    attendance: [],
    assignments: [],
    quiz: [],
    rawRows: DEMO_ROWS,
    headers: HEADERS,
    discoveredColumns: DEMO_DISCOVERED,
    mapping: DEMO_MAPPING,
  };
}
