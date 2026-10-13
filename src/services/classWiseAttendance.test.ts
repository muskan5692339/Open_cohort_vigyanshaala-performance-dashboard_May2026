import { describe, expect, it } from 'vitest';
import {
  buildSessionTrendFromClassWise,
  computeHoursBasedAttendance,
  formatSessionDateLabel,
  isOverallAttendanceSheetName,
  isSessionColumnHeader,
  isWatchTimeAttendanceSheetName,
  liveSessionsAttendancePct,
  parseClassWiseAttendanceRows,
  preRecordedAttendancePercent,
  preferAttendanceSource,
  totalSessionHours,
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

  it('recognizes 24-Sep style headers and Excel serial dates', () => {
    // 45924 ≈ 2026-09-24 in Excel serial
    const rows = [
      ['S.NO', 'EMAIL', 'FULL NAME', '24-Sep', '25-Sep', '45926'],
      ['1', 'a@x.com', 'A', '1', '0', '1'],
    ];
    const parsed = parseClassWiseAttendanceRows(rows, 'Daily Attendance');
    expect(parsed).not.toBeNull();
    const trend = buildSessionTrendFromClassWise(parsed!.entries[0]);
    expect(trend.map(p => p.name)).toEqual(['24 Sept', '25 Sept', '26 Sept']);
    expect(trend.map(p => p.value)).toEqual([1, 0, 1]);
  });

  it('picks up a column renamed from 26-Sep to 25-Sep', () => {
    const rows = [
      ['EMAIL', '22-Aug', '24-Sep', '25-Sep'],
      ['a@x.com', '1', '1', '1'],
    ];
    const parsed = parseClassWiseAttendanceRows(rows, 'Daily Attendance');
    expect(parsed!.sessionColumns.map(formatSessionDateLabel)).toEqual([
      '22 Aug',
      '24 Sept',
      '25 Sept',
    ]);
  });
});

describe('Attendance_WatchTime daily credit', () => {
  it('keeps recording decimals, caps a date above 1, and separates pre-recorded %', () => {
    const rows = [
      [
        'EMAIL',
        'STUDENT_ID',
        'Pre-recorded Hours Spent',
        'Pre-recorded Attendance %',
        '2026-08-22',
        '2026-08-24',
        '2026-08-27',
      ],
      ['a@x.com', '19121', '0.514', '34.959', '1', '0.53', '1.4'],
    ];
    const parsed = parseClassWiseAttendanceRows(rows, 'Attendance_WatchTime');
    expect(parsed).not.toBeNull();
    const entry = parsed!.entries[0];
    expect(entry.sessions.map(s => s.hours)).toEqual([1, 0.53, 1]);
    expect(entry.sessions.map(s => s.kind)).toEqual(['live', 'recording', 'missed'].map((_, i) => (
      i === 1 ? 'recording' : 'live'
    )));
    expect(totalSessionHours(entry)).toBe(2.53);
    expect(liveSessionsAttendancePct(entry)).toBe(84.33);
    expect(entry.preRecorded?.[0].hours).toBe(0.51);
    expect(preRecordedAttendancePercent(entry)).toBe(34.96);
    expect(isWatchTimeAttendanceSheetName('WatchTimeHours')).toBe(true);
    expect(isOverallAttendanceSheetName('Overall Attendance')).toBe(true);
    const fromOverall = parseClassWiseAttendanceRows(rows, 'Overall Attendance');
    expect(fromOverall?.entries[0].sessions.map(s => s.hours)).toEqual([1, 0.53, 1]);
    expect(fromOverall?.entries[0].preRecorded?.[0].hours).toBe(0.51);
    expect(preRecordedAttendancePercent(fromOverall!.entries[0])).toBe(34.96);
  });

  it('uses Overall Attendance instead of Daily Attendance', () => {
    const watch = parseClassWiseAttendanceRows(
      [
        ['EMAIL', '2026-08-22'],
        ['a@x.com', '0.4'],
      ],
      'Attendance_WatchTime',
    );
    const daily = parseClassWiseAttendanceRows(
      [
        ['EMAIL', '2026-08-22'],
        ['a@x.com', '1'],
      ],
      'Daily Attendance',
    );
    const overall = parseClassWiseAttendanceRows(
      [
        ['EMAIL', '2026-08-22', 'Pre-recorded Hours Spent'],
        ['a@x.com', '1', '0.53'],
      ],
      'Overall Attendance',
    );
    const chosen = preferAttendanceSource(overall, watch, daily, null);
    expect(chosen?.sheetName).toBe('Overall Attendance');
    expect(chosen?.entries[0].sessions[0].hours).toBe(1);
    expect(chosen?.entries[0].sessions[0].kind).toBe('live');
    expect(chosen?.entries[0].preRecorded?.[0].hours).toBe(0.53);

    const fallback = preferAttendanceSource(null, watch, daily, null);
    expect(fallback?.sheetName).toBe('Attendance_WatchTime');
    expect(fallback?.entries[0].sessions[0].hours).toBe(0.4);
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
