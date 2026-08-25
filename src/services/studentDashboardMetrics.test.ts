import { describe, expect, it } from 'vitest';
import { isAssignmentAccepted, isAssignmentSubmitted } from './studentAssignmentDisplay';
import {
  normalizeSessionHours,
  totalAttendedProgramHours,
  totalPreRecordedCreditHours,
  totalProgramHoursFromClassWise,
  totalSessionHours,
} from './classWiseAttendance';

describe('cohort-wide assignment and session rules', () => {
  it('counts Rejected with Feedback as submitted but not accepted', () => {
    expect(isAssignmentSubmitted('Rejected with Feedback')).toBe(true);
    expect(isAssignmentAccepted('Rejected with Feedback')).toBe(false);
    expect(isAssignmentAccepted('Accepted')).toBe(true);
  });

  it('computes acceptance as accepted/total for Supriti-style row', () => {
    const statuses = [
      'Rejected with Feedback',
      'Accepted',
      'Accepted',
      'Accepted',
      'Accepted',
    ];
    const accepted = statuses.filter(isAssignmentAccepted).length;
    const submitted = statuses.filter(isAssignmentSubmitted).length;
    expect(submitted).toBe(5);
    expect(accepted).toBe(4);
    expect(Math.round((accepted / statuses.length) * 100)).toBe(80);
  });

  it('caps each live session hour at 1 and sums for Sessions KPI', () => {
    const entry = {
      student_email: 'supriti059@gmail.com',
      sessions: [
        { key: 'WK1', hours: 1 },
        { key: 'WK2', hours: 0.69 },
        { key: 'WK3', hours: 2.5 },
        { key: 'WK4', hours: 0 },
      ],
    };
    expect(normalizeSessionHours(2.5)).toBe(1);
    expect(totalSessionHours(entry)).toBe(2.69);
  });

  it('adds live slots + pre-recorded credit hours for program total', () => {
    const entry = {
      student_email: 'x@test.com',
      sessions: Array.from({ length: 25 }, (_, i) => ({ key: `WK${i}`, hours: 1 })),
      preRecorded: [
        { key: 'Pre-recorded_A (30 min)', hours: 0.5, durationMin: 30, maxCreditHours: 0.5 },
        { key: 'Pre-recorded_B (6 min)', hours: 0, durationMin: 6, maxCreditHours: 0.1 },
      ],
    };
    expect(totalPreRecordedCreditHours(entry)).toBe(0.6);
    expect(totalProgramHoursFromClassWise(entry)).toBe(25.6);
    expect(totalAttendedProgramHours(entry)).toBe(25.5);
  });
});
