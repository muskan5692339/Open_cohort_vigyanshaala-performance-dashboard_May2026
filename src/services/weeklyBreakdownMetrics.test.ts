import { describe, expect, it } from 'vitest';
import {
  buildWeeklyColumnGroups,
  compareTwoWeeks,
  computeWeeklyBreakdown,
  parseWeekLabelFromHeader,
} from './weeklyBreakdownMetrics';

describe('parseWeekLabelFromHeader', () => {
  it('parses WK session columns', () => {
    expect(parseWeekLabelFromHeader('WK0_SUK_Saturday(6:30-7:30) 13th June')).toBe('WK0');
    expect(parseWeekLabelFromHeader('WK1_WS_Monday 15th')).toBe('WK1');
    expect(parseWeekLabelFromHeader('Pre-recorded_WK3_V1 (02:21 min)')).toBe('WK3');
  });
});

describe('buildWeeklyColumnGroups', () => {
  it('groups attendance columns by week', () => {
    const headers = [
      'Email',
      'student_category',
      'WK0_SUK_Saturday',
      'WK1_WS_Monday',
      'WK1_WS_2_Thursday',
      'Pre-recorded_WK3_V1',
    ];
    const groups = buildWeeklyColumnGroups(headers);
    expect(groups.map(g => g.week)).toEqual(['WK0', 'WK1', 'WK3']);
    expect(groups[0].attendanceCols).toHaveLength(1);
    expect(groups[1].attendanceCols).toHaveLength(2);
    expect(groups[2].attendanceCols).toHaveLength(1);
  });
});

describe('computeWeeklyBreakdown', () => {
  const headers = [
    'Email',
    'student_category',
    'current status',
    'WK0_SUK_Saturday',
    'WK1_WS_Monday',
    'WK1_Assignment_SWOT',
    'WK1_Quiz_1',
  ];
  const rows = [
    {
      Email: 'a@test.com',
      student_category: 'USF',
      'current status': 'Highly Active',
      WK0_SUK_Saturday: '1',
      WK1_WS_Monday: '1',
      WK1_Assignment_SWOT: 'Accepted',
      WK1_Quiz_1: '80',
    },
    {
      Email: 'b@test.com',
      student_category: 'UK_Colleges',
      'current status': 'Active',
      WK0_SUK_Saturday: '0',
      WK1_WS_Monday: '1',
      WK1_Assignment_SWOT: 'Submitted',
      WK1_Quiz_1: '',
    },
    {
      Email: 'c@test.com',
      student_category: 'USF',
      'current status': 'Partially Active',
      WK0_SUK_Saturday: '1',
      WK1_WS_Monday: '0',
      WK1_Assignment_SWOT: 'No submission',
      WK1_Quiz_1: '70',
    },
  ];

  it('aggregates attendance and assignments by week', () => {
    const points = computeWeeklyBreakdown(rows, headers, undefined, 'all');
    const wk0 = points.find(p => p.week === 'WK0')!;
    const wk1 = points.find(p => p.week === 'WK1')!;

    expect(wk0.attendanceCount).toBe(2);
    expect(wk1.attendanceCount).toBe(2);
    expect(wk1.assignmentsSubmitted).toBe(2);
    expect(wk1.assignmentsAccepted).toBe(1);
    expect(wk1.quizSubmissions).toBe(2);
  });

  it('filters by student category', () => {
    const points = computeWeeklyBreakdown(rows, headers, undefined, 'USF');
    const wk1 = points.find(p => p.week === 'WK1')!;
    expect(wk1.studentsInCategory).toBe(2);
    expect(wk1.assignmentsSubmitted).toBe(1);
  });

  it('counts activity tiers for students who attended that week', () => {
    const points = computeWeeklyBreakdown(rows, headers, undefined, 'all');
    const wk0 = points.find(p => p.week === 'WK0')!;
    expect(wk0.highlyActive).toBe(1);
    expect(wk0.partiallyActive).toBe(1);
  });
});

describe('compareTwoWeeks', () => {
  it('builds comparison deltas', () => {
    const points = computeWeeklyBreakdown(
      [
        { Email: 'a@test.com', WK0_SUK: '1', WK1_WS: '0', student_category: 'X' },
        { Email: 'b@test.com', WK0_SUK: '1', WK1_WS: '1', student_category: 'X' },
      ],
      ['Email', 'student_category', 'WK0_SUK', 'WK1_WS'],
      undefined,
      'all',
    );
    const cmp = compareTwoWeeks(points, 'WK0', 'WK1');
    const att = cmp.find(c => c.metric === 'Students attended')!;
    expect(att.weekA).toBe(2);
    expect(att.weekB).toBe(1);
    expect(att.delta).toBe(-1);
  });
});
