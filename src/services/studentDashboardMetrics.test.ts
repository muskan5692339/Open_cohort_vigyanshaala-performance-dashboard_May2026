import { describe, expect, it } from 'vitest';
import { isAssignmentAccepted, isAssignmentSubmitted } from './studentAssignmentDisplay';
import { normalizeSessionHours, totalSessionHours } from './classWiseAttendance';

describe('cohort-wide assignment and session rules', () => {
  it('counts Rejected with Feedback as submitted but not accepted', () => {
    expect(isAssignmentSubmitted('Rejected with Feedback')).toBe(true);
    expect(isAssignmentAccepted('Rejected with Feedback')).toBe(false);
    expect(isAssignmentAccepted('Accepted')).toBe(true);
  });

  it('caps each live session hour at 1 and sums for Sessions KPI', () => {
    const entry = {
      student_email: 'supriti059@gmail.com',
      sessions: [
        { key: 'WK1', hours: 1 },
        { key: 'WK2', hours: 0.69 },
        { key: 'WK3', hours: 2.5 }, // >1 → 1
        { key: 'WK4', hours: 0 },
      ],
    };
    expect(normalizeSessionHours(2.5)).toBe(1);
    expect(totalSessionHours(entry)).toBe(2.69);
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
});
