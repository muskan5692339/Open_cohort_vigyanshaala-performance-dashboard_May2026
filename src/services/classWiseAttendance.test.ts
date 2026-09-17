import { describe, expect, it } from 'vitest';
import {
  buildSessionTrendFromClassWise,
  computeHoursBasedAttendance,
  isSessionColumnHeader,
  parseClassWiseAttendanceRows,
} from './classWiseAttendance';

describe('parse Daily Attendance date columns', () => {
  it('uses date columns as the session-wise trend', () => {
    const rows = [
      ['', '', '', '11', '607'],
      ['S.NO', 'EMAIL', 'FULL NAME', '% Attendance', '2026-08-22', '2026-08-24', '2026-09-14'],
      ['1', 'rithu2128@gmail.com', 'N M RITHUNATH', '100', '1', '0', '1'],
    ];
    const parsed = parseClassWiseAttendanceRows(rows, 'Daily Attendance');
    expect(parsed).not.toBeNull();
    const trend = buildSessionTrendFromClassWise(parsed!.entries[0]);
    expect(trend.map(p => p.name)).toEqual(['22 Aug', '24 Aug', '14 Sept']);
    expect(trend.map(p => p.value)).toEqual([1, 0, 1]);
  });
});

describe('isSessionColumnHeader', () => {
  it('recognizes numbered week columns', () => {
    expect(isSessionColumnHeader('WK0_SUK_Saturday 13th')).toBe(true);
    expect(isSessionColumnHeader('WK1_WS_Monday 15th')).toBe(true);
    expect(isSessionColumnHeader('WK1_WS_2_Thursday 16th')).toBe(true);
  });

  it('recognizes master-class columns without a week number', () => {
    expect(isSessionColumnHeader('WK_MC_Saturday 18th')).toBe(true);
    expect(isSessionColumnHeader('WK_WS_Extra Session')).toBe(true);
  });

  it('excludes pre-recorded columns', () => {
    expect(isSessionColumnHeader('Pre-recorded WK3 (7 min)')).toBe(false);
  });
});

describe('parseClassWiseAttendanceRows', () => {
  it('includes WK_MC columns in session trend and attendance totals', () => {
    const rows = [
      ['Email', 'WK0_SUK_Monday 13th', 'WK1_WS_2_Thursday 16th', 'WK_MC_Saturday 18th', 'WK1_WS_Monday 20th'],
      ['student@example.com', '0.92', '0', '0', '0'],
    ];

    const parsed = parseClassWiseAttendanceRows(rows, 'Class-wise Attendance');
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionColumns).toContain('WK_MC_Saturday 18th');

    const entry = parsed!.entries[0];
    const trend = buildSessionTrendFromClassWise(entry);
    expect(trend.map(p => p.name)).toEqual([
      'WK0_SUK_Monday 13th',
      'WK1_WS_2_Thursday 16th',
      'WK_MC_Saturday 18th',
      'WK1_WS_Monday 20th',
    ]);

    const attendance = computeHoursBasedAttendance(entry, entry.sessions.length);
    expect(attendance.totalHours).toBe(4);
    expect(attendance.attendedHours).toBe(0.92);
    expect(attendance.attendedPct).toBe(23);
  });
});
