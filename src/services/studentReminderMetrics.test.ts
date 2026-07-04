import { describe, expect, it } from 'vitest';
import {
  buildReminderEmail,
  buildStudentReminderSnapshot,
  isoWeekKey,
  listStudentsNeedingReminders,
} from './studentReminderMetrics';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';

const samplePayload: ParsedExcelPayload = {
  cohortName: 'Open Cohort 2026',
  fileName: 'test.xlsx',
  students: [],
  attendance: [],
  assignments: [],
  quiz: [],
  rawRows: [
    {
      Name: 'Asha Kumar',
      Email: 'asha@example.com',
      'Attendance %': '45',
      Assignment_1: 'Pending',
      Quiz_1: '0',
    },
    {
      Name: 'Ravi Shah',
      Email: 'ravi@example.com',
      'Attendance %': '92',
      Assignment_1: 'Submitted',
      Quiz_1: '80',
    },
  ],
  headers: ['Name', 'Email', 'Attendance %', 'Assignment_1', 'Quiz_1'],
  mapping: {},
};

describe('studentReminderMetrics', () => {
  it('flags students with low attendance or pending work', () => {
    const needing = listStudentsNeedingReminders(samplePayload);
    expect(needing).toHaveLength(1);
    expect(needing[0].email).toBe('asha@example.com');
    expect(needing[0].reasons).toContain('attendance');
    expect(needing[0].reasons).toContain('assignment');
  });

  it('builds reminder email with dashboard link', () => {
    const snap = buildStudentReminderSnapshot(samplePayload, 'asha@example.com');
    expect(snap).not.toBeNull();
    const mail = buildReminderEmail(snap!, 'https://example.com/student-view');
    expect(mail.subject).toContain('reminder');
    expect(mail.text).toContain('https://example.com/student-view');
    expect(mail.html).toContain('Asha Kumar');
  });

  it('formats iso week keys', () => {
    expect(isoWeekKey(new Date('2026-07-06T12:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
